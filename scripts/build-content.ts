/**
 * Turns the Markdown texts in content/texts into everything the app needs:
 * narration audio with word-level timings, and a per-text dictionary with
 * IPA, parts of speech, English senses and native-speaker recordings.
 *
 *   npm run content         # only rebuild texts that changed
 *   npm run content:force   # rebuild everything
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  DictionaryEntry,
  TextDocument,
  TextIndex,
  TextSummary,
} from "../shared/types.ts";
import { PATHS } from "./pipeline/config.ts";
import { loadSourceTexts, type SourceText } from "./pipeline/source.ts";
import {
  collectVocabulary,
  countWords,
  flattenSentences,
  tokenize,
  tokenizeLine,
} from "./pipeline/tokenize.ts";
import { synthesize } from "./pipeline/tts.ts";
import { alignTimings } from "./pipeline/align.ts";
import { lookup } from "./pipeline/wiktionary.ts";
import { translateToEnglish, translationProvider } from "./pipeline/translate.ts";
import { downloadWordAudio } from "./pipeline/media.ts";
import { ensureDir, exists, log, readJson, writeJson } from "./pipeline/util.ts";

const force = process.argv.includes("--force");

interface BuildState {
  /** slug -> source hash of the last successful build. */
  hashes: Record<string, string>;
}

const statePath = path.join(PATHS.cache, "build-state.json");

async function buildText(source: SourceText): Promise<TextSummary> {
  log.step(`${source.title} (${source.slug})`);

  const heading = tokenizeLine(source.title, "h0");
  const paragraphs = tokenize(source.body);
  // Narration order: the title is read first, then the body.
  const sentences = [heading, ...flattenSentences(paragraphs)];
  const wordCount = countWords(sentences);
  log.info(`${paragraphs.length} paragraphs, ${wordCount} words (title included)`);

  log.info(`synthesizing with ${source.voice} at rate ${source.rate}...`);
  const narration = await synthesize(
    `${source.title}\n\n${source.body}`,
    source.voice,
    source.rate,
  );

  await ensureDir(PATHS.mediaTexts);
  const audioName = `${source.slug}.mp3`;
  await fs.writeFile(path.join(PATHS.mediaTexts, audioName), narration.audio);
  log.ok(`audio ${(narration.audio.length / 1024).toFixed(0)} KB, ${narration.durationSec.toFixed(1)}s`);

  const alignment = alignTimings(sentences, narration.words);
  const percent = alignment.total > 0 ? (alignment.matched / alignment.total) * 100 : 100;
  const alignMessage = `aligned ${alignment.matched}/${alignment.total} words (${percent.toFixed(0)}%)`;
  if (alignment.unmatched.length > 0) {
    log.warn(`${alignMessage} — no timing for: ${alignment.unmatched.slice(0, 8).join(", ")}`);
  } else {
    log.ok(alignMessage);
  }

  log.info(`translating ${paragraphs.length} paragraphs with ${translationProvider()}...`);
  const titleTranslation = await translateToEnglish(source.title);
  let translated = 0;
  for (const paragraph of paragraphs) {
    const text = paragraph.sentences.map((s) => s.text).join(" ");
    paragraph.translation = await translateToEnglish(text);
    if (paragraph.translation) translated += 1;
  }
  if (translated === paragraphs.length) {
    log.ok(`translated ${translated} paragraphs`);
  } else {
    log.warn(`translated ${translated}/${paragraphs.length} paragraphs`);
  }

  const vocabulary = collectVocabulary(sentences);
  log.info(`looking up ${vocabulary.size} distinct words...`);

  const dictionary: Record<string, DictionaryEntry> = {};
  let withAudio = 0;
  let missing = 0;

  for (const [key, surface] of vocabulary) {
    const { entry, sounds } = await lookup(key, surface);

    if (entry.form && sounds.form) {
      entry.form.audio = await downloadWordAudio(sounds.form);
    }
    if (entry.lemma && sounds.lemma) {
      entry.lemma.audio = await downloadWordAudio(sounds.lemma);
    }

    if (entry.form?.audio || entry.lemma?.audio) withAudio += 1;
    if (!entry.form) missing += 1;

    dictionary[key] = entry;
  }

  log.ok(`${vocabulary.size - missing} entries found, ${withAudio} with native audio`);
  if (missing > 0) log.warn(`${missing} words had no Wiktionary entry`);

  const document: TextDocument = {
    slug: source.slug,
    title: source.title,
    level: source.level,
    topic: source.topic,
    audio: {
      src: `/media/texts/${audioName}`,
      durationSec: narration.durationSec,
      voice: source.voice,
    },
    heading,
    titleTranslation,
    paragraphs,
    dictionary,
  };

  await writeJson(path.join(PATHS.dataTexts, `${source.slug}.json`), document);

  return {
    slug: source.slug,
    title: source.title,
    level: source.level,
    topic: source.topic,
    wordCount,
    durationSec: narration.durationSec,
  };
}

async function main(): Promise<void> {
  const sources = await loadSourceTexts();
  if (sources.length === 0) {
    log.fail(`no .md files in ${PATHS.source}`);
    process.exitCode = 1;
    return;
  }

  const state = (await readJson<BuildState>(statePath)) ?? { hashes: {} };
  const summaries: TextSummary[] = [];

  for (const source of sources) {
    const documentPath = path.join(PATHS.dataTexts, `${source.slug}.json`);
    const unchanged =
      !force && state.hashes[source.slug] === source.hash && (await exists(documentPath));

    if (unchanged) {
      const existing = await readJson<TextDocument>(documentPath);
      if (existing) {
        log.step(`${source.title} (${source.slug})`);
        log.info("unchanged, skipping (use npm run content:force to rebuild)");
        summaries.push({
          slug: existing.slug,
          title: existing.title,
          level: existing.level,
          topic: existing.topic,
          wordCount: countWords([existing.heading, ...flattenSentences(existing.paragraphs)]),
          durationSec: existing.audio.durationSec,
        });
        continue;
      }
    }

    summaries.push(await buildText(source));
    state.hashes[source.slug] = source.hash;
    await writeJson(statePath, state);
  }

  // Easiest first, so the sidebar reads as a course rather than a directory.
  summaries.sort(
    (a, b) => a.level.localeCompare(b.level) || a.title.localeCompare(b.title, "de"),
  );

  const index: TextIndex = {
    generatedAt: new Date().toISOString(),
    texts: summaries,
  };
  await writeJson(path.join(PATHS.data, "index.json"), index);

  log.step(`Done. ${summaries.length} text(s) available.`);
}

main().catch((error: unknown) => {
  log.fail((error as Error).stack ?? String(error));
  process.exitCode = 1;
});

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
  NarrationTrack,
  Sentence,
  TextDocument,
  TextIndex,
  TextSummary,
} from "../shared/types.ts";
import { VOICES } from "../shared/voices.ts";
import { DEFAULT_RATE, PATHS } from "./pipeline/config.ts";
import { loadSourceTexts, type SourceText } from "./pipeline/source.ts";
import { narrationOrder } from "../shared/narration.ts";
import {
  collectVocabulary,
  countWords,
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
  /** voice id -> the sample it was last recorded from, rate included. */
  samples?: Record<string, string>;
}

const statePath = path.join(PATHS.cache, "build-state.json");

/** Narration length per voice, which is what the sidebar shows. */
function durationsOf(narrations: Record<string, NarrationTrack>): Record<string, number> {
  return Object.fromEntries(
    Object.values(narrations).map((track) => [track.voice, track.durationSec]),
  );
}

/**
 * One clip per voice, saying who it is — what the picker plays when the reader
 * auditions a voice before committing a whole text to it. Cheap enough to keep
 * beside the texts, and skipped entirely while the sample is unchanged.
 */
async function buildVoiceSamples(state: BuildState): Promise<void> {
  await ensureDir(PATHS.mediaVoices);
  state.samples ??= {};

  // Voices that left the roster should not leave their clip behind.
  const wanted = new Set(VOICES.map((voice) => `${voice.id}.mp3`));
  for (const file of await fs.readdir(PATHS.mediaVoices)) {
    if (!wanted.has(file)) await fs.rm(path.join(PATHS.mediaVoices, file));
  }

  const recorded: string[] = [];
  for (const voice of VOICES) {
    const file = path.join(PATHS.mediaVoices, `${voice.id}.mp3`);
    const stamp = `${DEFAULT_RATE} ${voice.sample}`;
    if (!force && state.samples[voice.id] === stamp && (await exists(file))) continue;

    const spoken = await synthesize(voice.sample, voice.id, DEFAULT_RATE);
    await fs.writeFile(file, spoken.audio);
    state.samples[voice.id] = stamp;
    recorded.push(voice.name);
  }

  if (recorded.length > 0) {
    log.ok(`voice samples: recorded ${recorded.join(", ")}`);
  } else {
    log.info(`voice samples: ${VOICES.length} unchanged`);
  }
}

/**
 * Reads the text once per voice. The words are the same every time; the
 * timings are not, so each voice gets its own audio file and span table.
 */
async function narrate(
  source: SourceText,
  sentences: Sentence[],
): Promise<Record<string, NarrationTrack>> {
  const directory = path.join(PATHS.mediaTexts, source.slug);
  // Start clean, or a voice dropped from the roster leaves its file behind.
  await fs.rm(directory, { recursive: true, force: true });
  await ensureDir(directory);

  const narrations: Record<string, NarrationTrack> = {};

  for (const voice of VOICES) {
    const spoken = await synthesize(
      `${source.title}\n\n${source.body}`,
      voice.id,
      source.rate,
    );
    await fs.writeFile(path.join(directory, `${voice.id}.mp3`), spoken.audio);

    const alignment = alignTimings(sentences, spoken.words);
    const percent = alignment.total > 0 ? (alignment.matched / alignment.total) * 100 : 100;
    const message =
      `${voice.name}: ${(spoken.audio.length / 1024).toFixed(0)} KB, ` +
      `${spoken.durationSec.toFixed(1)}s, ` +
      `aligned ${alignment.matched}/${alignment.total} words (${percent.toFixed(0)}%)`;

    if (alignment.unmatched.length > 0) {
      log.warn(`${message} — no timing for: ${alignment.unmatched.slice(0, 8).join(", ")}`);
    } else {
      log.ok(message);
    }

    narrations[voice.id] = {
      voice: voice.id,
      src: `/media/texts/${source.slug}/${voice.id}.mp3`,
      durationSec: spoken.durationSec,
      spans: alignment.spans,
    };
  }

  return narrations;
}

/**
 * Deletes what no source text accounts for any more.
 *
 * Removing a Markdown file used to leave its JSON, its narrations and its hash
 * behind for good: the index stopped listing it, so nothing was visibly wrong
 * while `dist` quietly carried a text that no longer exists. Voices were
 * already cleaned up this way; texts were not.
 *
 * Word recordings are shared between texts, so they are kept as long as *any*
 * surviving document still names them.
 */
async function pruneRemovedTexts(slugs: Set<string>, state: BuildState): Promise<void> {
  const removed: string[] = [];

  for (const file of await fs.readdir(PATHS.dataTexts)) {
    if (!file.endsWith(".json")) continue;
    if (slugs.has(path.basename(file, ".json"))) continue;
    await fs.rm(path.join(PATHS.dataTexts, file));
    removed.push(path.basename(file, ".json"));
  }

  for (const dir of await fs.readdir(PATHS.mediaTexts)) {
    if (slugs.has(dir)) continue;
    await fs.rm(path.join(PATHS.mediaTexts, dir), { recursive: true, force: true });
  }

  for (const slug of Object.keys(state.hashes)) {
    if (!slugs.has(slug)) delete state.hashes[slug];
  }

  // Whatever the surviving documents still point at, by file name.
  const wanted = new Set<string>();
  for (const slug of slugs) {
    const document = await readJson<TextDocument>(
      path.join(PATHS.dataTexts, `${slug}.json`),
    );
    for (const entry of Object.values(document?.dictionary ?? {})) {
      for (const clip of [entry.form?.audio, entry.lemma?.audio]) {
        if (clip) wanted.add(path.basename(clip.src));
      }
    }
  }

  let orphanedClips = 0;
  if (await exists(PATHS.mediaWords)) {
    for (const file of await fs.readdir(PATHS.mediaWords)) {
      if (wanted.has(file)) continue;
      await fs.rm(path.join(PATHS.mediaWords, file));
      orphanedClips += 1;
    }
  }

  if (removed.length > 0) {
    log.ok(`removed ${removed.join(", ")} — no source text any more`);
  }
  if (orphanedClips > 0) {
    log.ok(`removed ${orphanedClips} word recording(s) nothing refers to`);
  }
}

async function buildText(source: SourceText): Promise<TextSummary> {
  log.step(`${source.title} (${source.slug})`);

  const heading = tokenizeLine(source.title, "h0");
  const paragraphs = tokenize(source.body);
  const sentences = narrationOrder(heading, paragraphs);
  const wordCount = countWords(sentences);
  log.info(`${paragraphs.length} paragraphs, ${wordCount} words (title included)`);

  log.info(`synthesizing ${VOICES.length} voices at rate ${source.rate}...`);
  const narrations = await narrate(source, sentences);

  log.info(`translating ${paragraphs.length} paragraphs with ${translationProvider()}...`);
  const titleTranslation = await translateToEnglish(source.title);
  // The one translation most likely to degrade quietly, and the documents are
  // no longer written in a shape anybody would open to look at it.
  if (titleTranslation) {
    log.ok(`title: "${source.title}" -> "${titleTranslation}"`);
  } else {
    log.warn(`title: "${source.title}" was not translated`);
  }

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
    narrations,
    heading,
    titleTranslation,
    paragraphs,
    dictionary,
  };

  await writeJson(path.join(PATHS.dataTexts, `${source.slug}.json`), document, {
    pretty: false,
  });

  return {
    slug: source.slug,
    title: source.title,
    level: source.level,
    topic: source.topic,
    wordCount,
    durations: durationsOf(narrations),
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

  log.step("Voices");
  await buildVoiceSamples(state);
  await writeJson(statePath, state);

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
        // Rewritten even though nothing was rebuilt: how the file is *written*
        // is not part of the source hash, so without this a formatting change
        // would only reach a text the next time its content happened to
        // change. It costs one write of an already-loaded object.
        await writeJson(documentPath, existing, { pretty: false });
        summaries.push({
          slug: existing.slug,
          title: existing.title,
          level: existing.level,
          topic: existing.topic,
          wordCount: countWords(narrationOrder(existing.heading, existing.paragraphs)),
          durations: durationsOf(existing.narrations),
        });
        continue;
      }
    }

    summaries.push(await buildText(source));
    state.hashes[source.slug] = source.hash;
    await writeJson(statePath, state);
  }

  await pruneRemovedTexts(new Set(sources.map((source) => source.slug)), state);
  await writeJson(statePath, state);

  // Easiest first, so the sidebar reads as a course rather than a directory.
  summaries.sort(
    (a, b) => a.level.localeCompare(b.level) || a.title.localeCompare(b.title, "de"),
  );

  const index: TextIndex = {
    generatedAt: new Date().toISOString(),
    texts: summaries,
  };
  await writeJson(path.join(PATHS.data, "index.json"), index, { pretty: false });

  log.step(`Done. ${summaries.length} text(s) available.`);
}

main().catch((error: unknown) => {
  log.fail((error as Error).stack ?? String(error));
  process.exitCode = 1;
});

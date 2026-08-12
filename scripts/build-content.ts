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
  CreditsIndex,
  DictionaryEntry,
  NarrationTrack,
  Sentence,
  TextDocument,
  TextIndex,
  TextSummary,
} from "../shared/types.ts";
import { VOICES } from "../shared/voices.ts";
import { DEFAULT_RATE, PATHS } from "./pipeline/config.ts";
import { byCourseOrder, loadSourceTexts, type SourceText } from "./pipeline/source.ts";
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
import {
  applyTranslation,
  loadTranslation,
  type SentenceMismatch,
  type Translation,
} from "./pipeline/translations.ts";
import { downloadWordAudio } from "./pipeline/media.ts";
import { fetchCredits } from "./pipeline/commons.ts";
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
 * The one thing about a hand-written translation a build can check: the reader
 * sets the two blocks one under the other and reads them line for line, so a
 * paragraph that breaks into three sentences in German and two in English no
 * longer lines up with itself.
 */
function reportSentenceCounts(slug: string, mismatches: SentenceMismatch[]): void {
  if (mismatches.length === 0) {
    log.ok(`translation: sentence counts match`);
    return;
  }
  const where = mismatches
    .map((m) => `${m.paragraph} (${m.german} vs ${m.english})`)
    .join(", ");
  log.warn(
    `translation: ${mismatches.length} paragraph(s) out of step in ` +
      `content/translations/${slug}.md — ${where}`,
  );
}

/**
 * Puts the hand-written English on the paragraphs, and says so.
 *
 * Separate from buildText because the skip path needs it too: a translation is
 * not in the source hash, so editing one has to reach a text that is otherwise
 * unchanged.
 */
function useTranslation(
  slug: string,
  paragraphs: TextDocument["paragraphs"],
  translation: Translation,
): string | null {
  reportSentenceCounts(slug, applyTranslation(paragraphs, translation));
  return translation.title;
}

/** Where a text's header illustration is served from, if it has one. */
function imagePath(source: SourceText): string | undefined {
  return source.image ? `/media/images/${source.image}` : undefined;
}

/**
 * Copies the header illustrations across and sweeps the ones nothing names.
 *
 * They are the one part of a text that is not made here — no network, no
 * synthesis, just a file — so they are handled outside the per-text build and
 * outside the source hash: swapping a picture must not cost a re-narration.
 * Several texts may share one image, which is why they are copied by file name
 * rather than by slug.
 */
async function copyImages(sources: SourceText[]): Promise<void> {
  await ensureDir(PATHS.mediaImages);

  const wanted = new Set<string>();
  for (const source of sources) {
    if (!source.image) continue;

    const from = path.join(PATHS.sourceImages, source.image);
    if (!(await exists(from))) {
      throw new Error(
        `${path.basename(source.file)}: image "${source.image}" is not in content/images`,
      );
    }
    await fs.copyFile(from, path.join(PATHS.mediaImages, source.image));
    wanted.add(source.image);
  }

  let removed = 0;
  for (const file of await fs.readdir(PATHS.mediaImages)) {
    if (wanted.has(file)) continue;
    await fs.rm(path.join(PATHS.mediaImages, file));
    removed += 1;
  }

  log.ok(
    `images: ${wanted.size} in use` + (removed > 0 ? `, ${removed} no longer named` : ""),
  );
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
/**
 * The recordings the surviving documents point at, read in one pass: the local
 * file names, which is what the sweep deletes by, and the Commons names, which
 * is what the credits are fetched by. Two answers from one walk, because they
 * are the same walk.
 */
async function clipsInDocuments(
  slugs: Set<string>,
): Promise<{ local: Set<string>; commons: Set<string> }> {
  const local = new Set<string>();
  const commons = new Set<string>();

  for (const slug of slugs) {
    const document = await readJson<TextDocument>(
      path.join(PATHS.dataTexts, `${slug}.json`),
    );
    for (const entry of Object.values(document?.dictionary ?? {})) {
      for (const clip of [entry.form?.audio, entry.lemma?.audio]) {
        if (!clip) continue;
        local.add(path.basename(clip.src));
        commons.add(clip.file);
      }
    }
  }

  return { local, commons };
}

/**
 * Writes public/data/credits.json: who recorded each word, and under what
 * licence.
 *
 * Rewritten on every run like the index, and for the same reason — it is
 * assembled from the documents that *exist* rather than from the texts that
 * were built this time, so a skipped text still credits its recordings and a
 * recording nothing refers to any more stops being credited. Nothing here
 * touches a document, so none of it reaches the source hash.
 */
async function writeCredits(slugs: Set<string>): Promise<void> {
  const { commons } = await clipsInDocuments(slugs);
  const files = [...commons].sort();
  const clips = await fetchCredits(files);

  const index: CreditsIndex = { generatedAt: new Date().toISOString(), clips };
  await writeJson(path.join(PATHS.data, "credits.json"), index, { pretty: false });

  const complete = files.filter((file) => clips[file]?.author && clips[file]?.license);
  log.ok(`credits: ${complete.length}/${files.length} with an author and a licence`);

  const licences = [...new Set(files.map((f) => clips[f]?.license).filter(Boolean))].sort();
  if (licences.length > 0) log.info(`licences in use: ${licences.join(", ")}`);

  // Worth naming: a recording nobody is credited for is one the site cannot
  // attribute, which is the whole point of this step.
  const anonymous = files.filter((file) => !clips[file]?.author);
  if (anonymous.length > 0) {
    log.warn(
      `no author for ${anonymous.length}: ${anonymous.slice(0, 6).join(", ")}` +
        (anonymous.length > 6 ? ", …" : ""),
    );
  }
}

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
  const { local: wanted } = await clipsInDocuments(slugs);

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

  const written = await loadTranslation(source.slug);
  let titleTranslation: string | null;

  if (written) {
    log.info(`translation: content/translations/${source.slug}.md`);
    titleTranslation = useTranslation(source.slug, paragraphs, written);
  } else {
    log.info(`translating ${paragraphs.length} paragraphs with ${translationProvider()}...`);
    titleTranslation = await translateToEnglish(source.title);

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
  }

  // The one translation most likely to degrade quietly, and the documents are
  // no longer written in a shape anybody would open to look at it.
  if (titleTranslation) {
    log.ok(`title: "${source.title}" -> "${titleTranslation}"`);
  } else {
    log.warn(`title: "${source.title}" was not translated`);
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
    image: imagePath(source),
  };
}

async function main(): Promise<void> {
  const sources = await loadSourceTexts();
  // Sorted here and nowhere else: a summary is pushed per source in this
  // order, so this is the order of the index and therefore of the sidebar.
  // Sorting the summaries at the end instead would work equally well and
  // leave two things to keep in step; it also read the build log in an order
  // no one sees.
  sources.sort(byCourseOrder);
  if (sources.length === 0) {
    log.fail(`no .md files in ${PATHS.source}`);
    process.exitCode = 1;
    return;
  }

  const state = (await readJson<BuildState>(statePath)) ?? { hashes: {} };

  log.step("Voices");
  await buildVoiceSamples(state);
  await writeJson(statePath, state);

  log.step("Images");
  await copyImages(sources);

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
        // A translation is source material and, like the picture, deliberately
        // outside the source hash: correcting a sentence of English must not
        // cost VOICES.length fresh syntheses. It is re-applied here rather
        // than kept from the document, which is free — the skip path rewrites
        // the file anyway, for the reason below.
        const written = await loadTranslation(source.slug);
        if (written) {
          existing.titleTranslation = useTranslation(
            source.slug,
            existing.paragraphs,
            written,
          );
        }
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
          // From the source and not from the document: the picture is not part
          // of what was skipped, so a text that has just been given one picks
          // it up without rebuilding.
          image: imagePath(source),
        });
        continue;
      }
    }

    summaries.push(await buildText(source));
    state.hashes[source.slug] = source.hash;
    await writeJson(statePath, state);
  }

  const slugs = new Set(sources.map((source) => source.slug));
  await pruneRemovedTexts(slugs, state);
  await writeJson(statePath, state);

  log.step("Credits");
  await writeCredits(slugs);

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

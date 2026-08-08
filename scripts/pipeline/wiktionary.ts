import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { DictionaryEntry, LexemeInfo, Sense, SenseGroup } from "../../shared/types.ts";
import { KAIKKI_BASE, PATHS } from "./config.ts";
import { fetchWithRetry, NotFoundError } from "./http.ts";
import { ensureDir, exists, log, slugify } from "./util.ts";

/** Shape of the Wiktextract records served by kaikki.org (fields we use). */
interface KaikkiEntry {
  word: string;
  pos: string;
  lang_code?: string;
  senses?: Array<{
    glosses?: string[];
    raw_glosses?: string[];
    tags?: string[];
    form_of?: Array<{ word: string }>;
    alt_of?: Array<{ word: string }>;
  }>;
  sounds?: Array<{
    ipa?: string;
    audio?: string;
    ogg_url?: string;
    mp3_url?: string;
    tags?: string[];
  }>;
}

export interface RawSound {
  file: string;
  url: string;
  tags: string[];
}

const GENDER_TAGS = ["masculine", "feminine", "neuter"] as const;

/** Labels that describe the entry's grammar rather than its usage register. */
const STRUCTURAL_TAGS = new Set([
  "masculine",
  "feminine",
  "neuter",
  "strong",
  "weak",
  "mixed",
  "no-plural",
  "uncountable",
  "countable",
  "form-of",
  "plural",
  "singular",
]);

const cacheDir = path.join(PATHS.cache, "kaikki");

function kaikkiUrl(word: string): string {
  const first = word.slice(0, 1);
  const second = word.slice(0, 2);
  return [
    KAIKKI_BASE,
    encodeURIComponent(first),
    encodeURIComponent(second),
    `${encodeURIComponent(word)}.jsonl`,
  ].join("/");
}

/** Cache file name that cannot collide between different spellings. */
function cacheFileFor(word: string): string {
  const digest = crypto.createHash("sha1").update(word).digest("hex").slice(0, 8);
  return path.join(cacheDir, `${slugify(word) || "x"}-${digest}.jsonl`);
}

/**
 * Fetches (and caches) all German Wiktionary records for an exact spelling.
 * Only definitive answers are cached: a rate-limited request must not be
 * remembered as "no such word".
 */
async function fetchRecords(word: string): Promise<KaikkiEntry[]> {
  await ensureDir(cacheDir);
  const cacheFile = cacheFileFor(word);

  if (await exists(cacheFile)) {
    return parseRecords(await fs.readFile(cacheFile, "utf8"));
  }

  let body = "";
  try {
    body = await (await fetchWithRetry(kaikkiUrl(word))).text();
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      log.warn(`kaikki ${word}: ${(error as Error).message}`);
      return [];
    }
  }

  await fs.writeFile(cacheFile, body, "utf8");
  return parseRecords(body);
}

function parseRecords(body: string): KaikkiEntry[] {
  const records: KaikkiEntry[] = [];
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as KaikkiEntry;
      if (!parsed.lang_code || parsed.lang_code === "de") records.push(parsed);
    } catch {
      // Truncated line; skip it.
    }
  }
  return records;
}

/**
 * Wiktionary writes transcriptions inconsistently — phonemic `/…/`, phonetic
 * `[…]`, or bare — so every one is stripped and re-wrapped the same way.
 */
function normalizeIpa(raw: string): string | null {
  const body = raw.trim().replace(/^[/[]+/, "").replace(/[/\]]+$/, "").trim();
  if (!body) return null;
  return `/${body}/`;
}

/** Prefers standard German over regional transcriptions. */
function pickIpa(records: KaikkiEntry[]): string | null {
  const candidates: Array<{ ipa: string; rank: number }> = [];

  for (const record of records) {
    for (const sound of record.sounds ?? []) {
      if (!sound.ipa) continue;
      const ipa = normalizeIpa(sound.ipa);
      if (!ipa) continue;

      const tags = (sound.tags ?? []).map((t) => t.toLowerCase());
      const regional = tags.some(
        (t) => t.includes("austria") || t.includes("switzerland") || t.includes("swiss"),
      );
      candidates.push({ ipa, rank: regional ? 1 : 0 });
    }
  }

  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.ipa ?? null;
}

/**
 * Picks a native-speaker recording, preferring standard German over regional
 * variants — a learner wants the pronunciation they will hear on the radio.
 */
function pickSound(records: KaikkiEntry[]): RawSound | null {
  const candidates: RawSound[] = [];
  for (const record of records) {
    for (const sound of record.sounds ?? []) {
      const url = sound.mp3_url ?? sound.ogg_url;
      if (!url || !sound.audio) continue;
      candidates.push({ file: sound.audio, url, tags: sound.tags ?? [] });
    }
  }
  if (candidates.length === 0) return null;

  const rank = (sound: RawSound): number => {
    const tags = sound.tags.map((t) => t.toLowerCase());
    if (tags.some((t) => t.includes("austria") || t.includes("switzerland"))) return 2;
    if (tags.some((t) => t.includes("germany"))) return 0;
    return 1;
  };

  return [...candidates].sort((a, b) => rank(a) - rank(b))[0];
}

function buildGroups(records: KaikkiEntry[]): SenseGroup[] {
  const groups: SenseGroup[] = [];

  for (const record of records) {
    const senses: Sense[] = [];
    let gender: string | null = null;

    for (const sense of record.senses ?? []) {
      const tags = sense.tags ?? [];
      gender ??= GENDER_TAGS.find((g) => tags.includes(g)) ?? null;

      // Inflection stubs carry no meaning of their own; the lemma has it.
      if (sense.form_of?.length || sense.alt_of?.length) continue;

      const gloss = sense.glosses?.at(-1);
      if (!gloss) continue;

      senses.push({
        gloss,
        // Drop grammar bookkeeping ("class-7", "strong") and keep the labels a
        // reader acts on ("colloquial", "figuratively", "transitive").
        tags: tags.filter((t) => !STRUCTURAL_TAGS.has(t) && !/^class-\d+$/.test(t)),
      });
    }

    if (senses.length > 0) {
      groups.push({ pos: record.pos, gender, senses });
    }
  }

  return groups;
}

/** Finds the lemma an inflected spelling belongs to, with its description. */
function findInflection(
  records: KaikkiEntry[],
): { lemma: string; note: string } | null {
  for (const record of records) {
    for (const sense of record.senses ?? []) {
      const target = sense.form_of?.[0]?.word ?? sense.alt_of?.[0]?.word;
      if (!target) continue;
      const note = sense.raw_glosses?.[0] ?? sense.glosses?.[0] ?? "";
      return { lemma: target, note: note.replace(/\s*:\s*$/, "") };
    }
  }
  return null;
}

function wiktionaryUrl(word: string): string {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#German`;
}

/**
 * Spellings to try, in order. German capitalizes nouns, so a sentence-initial
 * word may only exist lowercase, while a noun only exists capitalized.
 */
function spellingCandidates(surface: string): string[] {
  const lower = surface.toLowerCase();
  const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [...new Set([surface, lower, capitalized])];
}

interface Resolved {
  records: KaikkiEntry[];
  word: string;
}

async function resolveSpelling(surface: string): Promise<Resolved | null> {
  for (const candidate of spellingCandidates(surface)) {
    const records = await fetchRecords(candidate);
    if (records.length > 0) return { records, word: candidate };
  }
  return null;
}

/** Audio is attached later, once the recording has been downloaded locally. */
function toLexeme(resolved: Resolved): LexemeInfo {
  return {
    word: resolved.word,
    ipa: pickIpa(resolved.records),
    audio: null,
    groups: buildGroups(resolved.records),
    wiktionaryUrl: wiktionaryUrl(resolved.word),
  };
}

export interface LookupResult {
  entry: DictionaryEntry;
  /** Recordings still to download, keyed by the lexeme that needs them. */
  sounds: { form: RawSound | null; lemma: RawSound | null };
}

/**
 * Builds a dictionary entry for one surface form: its own pronunciation and
 * senses, plus the lemma it inflects from (which is where an inflected form's
 * translations live).
 */
export async function lookup(key: string, surface: string): Promise<LookupResult> {
  const resolved = await resolveSpelling(surface);

  if (!resolved) {
    return {
      entry: {
        key,
        surface,
        form: null,
        inflectionOf: null,
        inflectionNote: null,
        lemma: null,
      },
      sounds: { form: null, lemma: null },
    };
  }

  const formSound = pickSound(resolved.records);
  const form = toLexeme(resolved);
  const inflection = findInflection(resolved.records);

  let lemma: LexemeInfo | null = null;
  let lemmaSound: RawSound | null = null;

  // Only follow the chain when the form itself has no meaning of its own.
  if (inflection && inflection.lemma.toLowerCase() !== resolved.word.toLowerCase()) {
    const lemmaResolved = await resolveSpelling(inflection.lemma);
    if (lemmaResolved) {
      lemmaSound = pickSound(lemmaResolved.records);
      lemma = toLexeme(lemmaResolved);
    }
  }

  return {
    entry: {
      key,
      surface,
      form,
      inflectionOf: inflection?.lemma ?? null,
      inflectionNote: inflection?.note ?? null,
      lemma,
    },
    sounds: { form: formSound, lemma: lemmaSound },
  };
}

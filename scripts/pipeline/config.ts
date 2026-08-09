import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, "..", "..");

export const PATHS = {
  /** Hand-written source texts (Markdown + front matter). */
  source: path.join(ROOT, "content", "texts"),
  /** Generated JSON consumed by the app at runtime. */
  data: path.join(ROOT, "public", "data"),
  dataTexts: path.join(ROOT, "public", "data", "texts"),
  /** Generated audio. */
  mediaTexts: path.join(ROOT, "public", "media", "texts"),
  mediaWords: path.join(ROOT, "public", "media", "words"),
  /** Network responses, kept out of the app bundle. */
  cache: path.join(ROOT, ".cache"),
} as const;

/**
 * Default narration voice. The multilingual neural voices read German with
 * natural prosody and, unlike the older ones, keep clean word boundaries.
 * Override per text with `voice:` in the front matter.
 */
export const DEFAULT_VOICE = "de-DE-SeraphinaMultilingualNeural";

/**
 * Slightly slower than default: this is reading practice, not an audiobook.
 * Front matter key: `rate:` (e.g. "-15%").
 */
export const DEFAULT_RATE = "-10%";

/**
 * Wikimedia asks clients to identify themselves and to keep request rates
 * modest; see scripts/pipeline/http.ts for the throttling that goes with this.
 */
export const USER_AGENT =
  "texts-in-german/0.1 (personal offline German reading trainer; non-commercial)";

/** Wiktextract dumps of English Wiktionary's German entries. */
export const KAIKKI_BASE = "https://kaikki.org/dictionary/German/meaning";

/**
 * Bump whenever the shape of a generated document changes. It feeds the source
 * hash, so a format change rebuilds every text instead of leaving old files
 * missing the new fields.
 */
export const PIPELINE_VERSION = 2;

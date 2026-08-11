import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, "..", "..");

export const PATHS = {
  /** Hand-written source texts (Markdown + front matter). */
  source: path.join(ROOT, "content", "texts"),
  /** Header illustrations, named by a text's `image:` key. Shared between texts. */
  sourceImages: path.join(ROOT, "content", "images"),
  /** Generated JSON consumed by the app at runtime. */
  data: path.join(ROOT, "public", "data"),
  dataTexts: path.join(ROOT, "public", "data", "texts"),
  /** Generated audio. */
  mediaTexts: path.join(ROOT, "public", "media", "texts"),
  mediaWords: path.join(ROOT, "public", "media", "words"),
  /** Header illustrations, copied verbatim from content/images. */
  mediaImages: path.join(ROOT, "public", "media", "images"),
  /** One audition clip per voice, for the picker. */
  mediaVoices: path.join(ROOT, "public", "media", "voices"),
  /** Network responses, kept out of the app bundle. */
  cache: path.join(ROOT, ".cache"),
} as const;

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
  "lehrman-deutsch/0.1 (personal offline German reading trainer; non-commercial)";

/** Wiktextract dumps of English Wiktionary's German entries. */
export const KAIKKI_BASE = "https://kaikki.org/dictionary/German/meaning";

/**
 * Bump whenever the shape of a generated document changes. It feeds the source
 * hash, so a format change rebuilds every text instead of leaving old files
 * missing the new fields.
 */
export const PIPELINE_VERSION = 4;

/**
 * Data contract shared by the build pipeline (scripts/) and the app (src/).
 * The pipeline writes these shapes into public/data; the app only ever reads them.
 */

export type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/** One entry in public/data/index.json — everything the sidebar needs. */
export interface TextSummary {
  slug: string;
  title: string;
  level: Level;
  topic?: string;
  wordCount: number;
  /** Length of the narration per voice id; each voice reads at its own pace. */
  durations: Record<string, number>;
}

export interface TextIndex {
  generatedAt: string;
  texts: TextSummary[];
}

export interface WordToken {
  kind: "word";
  /** Stable id, unique within the document: "p0s1w2". */
  id: string;
  /** Surface form exactly as printed. */
  text: string;
  /** Dictionary lookup key: lowercased, punctuation stripped. */
  key: string;
}

export interface PunctToken {
  kind: "punct";
  text: string;
}

export type Token = WordToken | PunctToken;

export interface Sentence {
  id: string;
  text: string;
  tokens: Token[];
}

/** Playback window in seconds, rounded to the millisecond. */
export type Span = [start: number, end: number];

/**
 * One reading of the whole text. Timings live here rather than on the tokens
 * because every voice speaks the same words at its own pace: the text is
 * stored once, the timings once per voice.
 */
export interface NarrationTrack {
  /** Voice id from shared/voices.ts. */
  voice: string;
  /** Path relative to the site root. */
  src: string;
  durationSec: number;
  /**
   * Spans keyed by WordToken.id and Sentence.id. A word the engine never
   * reported and whose neighbours could not bracket it is simply absent.
   */
  spans: Record<string, Span>;
}

export interface Paragraph {
  id: string;
  sentences: Sentence[];
  /** English rendering of the whole paragraph; null if translation failed. */
  translation: string | null;
}

export interface AudioClip {
  /** Path relative to the site root, e.g. "/media/words/de-schnee.mp3". */
  src: string;
  /** Provenance tags from Wiktionary, e.g. ["Germany", "Berlin"]. */
  tags: string[];
  /** Original Wikimedia Commons file name, kept for attribution. */
  file: string;
}

export interface Sense {
  gloss: string;
  /** Register/domain labels, e.g. ["colloquial"], ["figuratively"]. */
  tags: string[];
}

/** Senses of one lexeme under a single part of speech. */
export interface SenseGroup {
  /** Wiktionary part-of-speech code: "noun", "verb", "adj", ... */
  pos: string;
  /** "masculine" | "feminine" | "neuter" for nouns, else null. */
  gender: string | null;
  senses: Sense[];
}

/** Everything known about one lexeme (either the surface form or its lemma). */
export interface LexemeInfo {
  word: string;
  ipa: string | null;
  /** Native-speaker recording, downloaded locally. Null when none exists. */
  audio: AudioClip | null;
  groups: SenseGroup[];
  wiktionaryUrl: string;
}

export interface DictionaryEntry {
  key: string;
  /** Surface form as it appears in the text. */
  surface: string;
  /** Info for the surface form itself; null when Wiktionary has no such page. */
  form: LexemeInfo | null;
  /** Set when the surface form is an inflection: "gingen" -> "gehen". */
  inflectionOf: string | null;
  /** Human-readable grammatical description of the inflection. */
  inflectionNote: string | null;
  /** Info for the lemma. For inflected forms this carries the translations. */
  lemma: LexemeInfo | null;
}

export interface TextDocument {
  slug: string;
  title: string;
  level: Level;
  topic?: string;
  /** One track per voice id; the reader picks which one plays. */
  narrations: Record<string, NarrationTrack>;
  /** The German title, narrated and clickable like the body. */
  heading: Sentence;
  /** English rendering of the title, shown beneath it. */
  titleTranslation: string | null;
  paragraphs: Paragraph[];
  /** Keyed by WordToken.key. */
  dictionary: Record<string, DictionaryEntry>;
}

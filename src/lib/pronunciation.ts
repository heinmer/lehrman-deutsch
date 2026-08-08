import type { AudioClip, DictionaryEntry, LexemeInfo } from "../../shared/types";

/**
 * The lexeme whose recording we play for a surface form. An inflected form
 * rarely has one of its own, in which case the lemma's recording stands in.
 */
export function spokenLexeme(entry: DictionaryEntry | null): LexemeInfo | null {
  if (!entry) return null;
  if (entry.form?.audio) return entry.form;
  if (entry.lemma?.audio) return entry.lemma;
  return null;
}

export function pronunciationClip(entry: DictionaryEntry | null): AudioClip | null {
  return spokenLexeme(entry)?.audio ?? null;
}

let current: HTMLAudioElement | null = null;

/**
 * Plays a single word recording, replacing whatever was playing. Kept apart
 * from the narration: these are short clips that interrupt each other freely.
 */
export function playClip(src: string): void {
  current?.pause();
  current = new Audio(src);
  void current.play();
}

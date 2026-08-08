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

/** Every recording referenced by a text, for prefetching. */
export function allClipSources(dictionary: Record<string, DictionaryEntry>): string[] {
  const sources: string[] = [];
  for (const entry of Object.values(dictionary)) {
    if (entry.form?.audio) sources.push(entry.form.audio.src);
    if (entry.lemma?.audio) sources.push(entry.lemma.audio.src);
  }
  return sources;
}

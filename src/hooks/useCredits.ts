import { useEffect, useState } from "react";
import type { ClipCredit, CreditsIndex } from "../../shared/types";
import { fetchCreditsIndex } from "../lib/api";

/**
 * One request for the whole session, shared by everything that asks. The file
 * is 7 KB over the wire and never changes while the page is open, so a second
 * fetch would only be a second copy of the same answer.
 */
let pending: Promise<CreditsIndex> | null = null;

/**
 * The recordings' credits, fetched the first time something needs them.
 *
 * `enabled` is what keeps it off the opening page: the word panel asks only
 * once it is showing a word, and the info window only while it is open, so a
 * reader who does neither never downloads it.
 *
 * A failure is swallowed on purpose. Only the index is worth interrupting a
 * reader for — a credit that did not arrive is a line that does not appear,
 * and the licences are still one link away on the file page either way.
 */
export function useCredits(enabled: boolean): CreditsIndex | null {
  const [credits, setCredits] = useState<CreditsIndex | null>(null);

  useEffect(() => {
    if (!enabled || credits) return;

    let live = true;
    pending ??= fetchCreditsIndex();
    void pending.then(
      (value) => {
        if (live) setCredits(value);
      },
      () => {
        // Left for the next thing that asks: a failed fetch is not an answer.
        pending = null;
      },
    );

    return () => {
      live = false;
    };
  }, [enabled, credits]);

  return credits;
}

/** The credit for one recording, by the Commons file name on its `AudioClip`. */
export function creditFor(
  credits: CreditsIndex | null,
  file: string | undefined,
): ClipCredit | null {
  if (!credits || !file) return null;
  return credits.clips[file] ?? null;
}

/**
 * The people who recorded the words, most heard first.
 *
 * The list is read off the data rather than written down, because a new text
 * can bring in a name nobody thought to add: today's 738 recordings are the
 * work of thirteen people, and a hand-kept list would go quietly wrong the
 * first time that changed.
 */
export function recordists(credits: CreditsIndex | null): string[] {
  if (!credits) return [];

  const counts = new Map<string, number>();
  for (const clip of Object.values(credits.clips)) {
    if (!clip.author) continue;
    counts.set(clip.author, (counts.get(clip.author) ?? 0) + 1);
  }

  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([author]) => author);
}

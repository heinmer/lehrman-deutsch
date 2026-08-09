import type { Sentence, Span, WordToken } from "../../shared/types.ts";
import type { Boundary } from "./tts.ts";
import { foldGerman } from "./util.ts";

export interface Alignment {
  /** Spans keyed by word id and sentence id, ready to store as-is. */
  spans: Record<string, Span>;
  total: number;
  matched: number;
  /** Surface forms the engine never reported, for build-log diagnostics. */
  unmatched: string[];
}

function comparable(text: string): string {
  return foldGerman(text).replace(/[^\p{L}\p{N}]/gu, "");
}

/** Milliseconds are already finer than anything the reader can perceive. */
function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/**
 * How many boundaries to discard while resynchronising after a mismatch. The
 * engine can skip a token or read it as something unrelated; a small window
 * recovers without drifting away from the text.
 */
const LOOKAHEAD = 4;

/**
 * Matches TTS timings to the tokens and returns them as a lookup table. The
 * document itself is left untouched, so the same sentences can be aligned once
 * per voice.
 *
 * `sentences` must be in narration order — the title first, then the body.
 */
export function alignTimings(
  sentences: Sentence[],
  boundaries: Boundary[],
): Alignment {
  const tokens = wordsOf(sentences);
  /** Parallel to `tokens`; null until a boundary claims the word. */
  const timings: (Span | null)[] = tokens.map(() => null);

  const unmatched: string[] = [];

  // Walk tokens and boundaries together. The relationship is not one-to-one:
  // the engine sometimes reports two words in a single event ("Die Straße"),
  // so a boundary is consumed piece by piece rather than all at once.
  let index = 0;
  let consumed = 0;

  tokens.forEach((token, position) => {
    const target = comparable(token.text);
    if (!target) return;

    // Where this token's search began. A word the engine never spoke has to
    // leave the cursor exactly as it found it: the boundaries it scanned past
    // belong to the words that follow, and swallowing them costs each of those
    // its timing too — one skipped word turning into a run of them.
    const searchIndex = index;
    const searchConsumed = consumed;

    let matched = false;
    for (let skipped = 0; skipped <= LOOKAHEAD && index < boundaries.length; skipped += 1) {
      const spoken = comparable(boundaries[index].text);
      const rest = spoken.slice(consumed);

      if (rest.length === 0) {
        index += 1;
        consumed = 0;
        skipped -= 1; // Exhausting a boundary is progress, not a mismatch.
        continue;
      }
      if (rest.startsWith(target) || target.startsWith(rest)) {
        matched = true;
        break;
      }

      index += 1;
      consumed = 0;
    }

    if (!matched) {
      index = searchIndex;
      consumed = searchConsumed;
      unmatched.push(token.text);
      return;
    }

    const boundary = boundaries[index];
    const spoken = comparable(boundary.text);
    const rest = spoken.slice(consumed);

    if (rest.startsWith(target)) {
      // The token sits inside this boundary; split the span by character count.
      const span = boundary.end - boundary.start;
      const scale = spoken.length > 0 ? span / spoken.length : 0;
      timings[position] = [
        boundary.start + consumed * scale,
        boundary.start + (consumed + target.length) * scale,
      ];

      consumed += target.length;
      if (consumed >= spoken.length) {
        index += 1;
        consumed = 0;
      }
    } else {
      // The token is spread over this boundary and the ones that follow.
      let last = index;
      let covered = rest;
      while (
        covered.length < target.length &&
        last + 1 < boundaries.length &&
        target.startsWith(covered + comparable(boundaries[last + 1].text))
      ) {
        last += 1;
        covered += comparable(boundaries[last].text);
      }

      timings[position] = [boundary.start, boundaries[last].end];
      index = last + 1;
      consumed = 0;
    }
  });

  const matched = timings.filter((span) => span !== null).length;

  fillGaps(timings);

  const spans: Record<string, Span> = {};
  tokens.forEach((token, position) => {
    const span = timings[position];
    if (span) spans[token.id] = [round(span[0]), round(span[1])];
  });

  // A sentence lasts from its first timed word to its last.
  for (const sentence of sentences) {
    const timed = sentence.tokens
      .filter((t): t is WordToken => t.kind === "word")
      .map((t) => spans[t.id])
      .filter((span): span is Span => span !== undefined);

    if (timed.length > 0) {
      spans[sentence.id] = [timed[0][0], timed[timed.length - 1][1]];
    }
  }

  return { spans, total: tokens.length, matched, unmatched };
}

function wordsOf(sentences: Sentence[]): WordToken[] {
  const tokens: WordToken[] = [];
  for (const s of sentences) {
    for (const t of s.tokens) {
      if (t.kind === "word") tokens.push(t);
    }
  }
  return tokens;
}

/**
 * Gives untimed words the span between their timed neighbours, so a word the
 * engine skipped still highlights instead of being silently dead.
 */
function fillGaps(timings: (Span | null)[]): void {
  for (let i = 0; i < timings.length; i += 1) {
    if (timings[i] !== null) continue;

    const previousEnd = timings[i - 1]?.[1] ?? null;
    let nextStart: number | null = null;
    for (let j = i + 1; j < timings.length; j += 1) {
      const span = timings[j];
      if (span) {
        nextStart = span[0];
        break;
      }
    }

    if (previousEnd !== null && nextStart !== null && nextStart > previousEnd) {
      timings[i] = [previousEnd, nextStart];
    }
  }
}

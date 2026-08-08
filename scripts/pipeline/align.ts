import type { Sentence, WordToken } from "../../shared/types.ts";
import type { Boundary } from "./tts.ts";
import { foldGerman } from "./util.ts";

export interface AlignmentReport {
  total: number;
  matched: number;
  /** Surface forms the engine never reported, for build-log diagnostics. */
  unmatched: string[];
}

function comparable(text: string): string {
  return foldGerman(text).replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * How many boundaries to discard while resynchronising after a mismatch. The
 * engine can skip a token or read it as something unrelated; a small window
 * recovers without drifting away from the text.
 */
const LOOKAHEAD = 4;

/**
 * Writes TTS timings onto the tokens, then derives sentence spans from the
 * words that were matched. Mutates the sentences in place.
 *
 * `sentences` must be in narration order — the title first, then the body.
 */
export function alignTimings(
  sentences: Sentence[],
  boundaries: Boundary[],
): AlignmentReport {
  const tokens = wordsOf(sentences);

  const unmatched: string[] = [];

  // Walk tokens and boundaries together. The relationship is not one-to-one:
  // the engine sometimes reports two words in a single event ("Die Straße"),
  // so a boundary is consumed piece by piece rather than all at once.
  let index = 0;
  let consumed = 0;

  for (const token of tokens) {
    const target = comparable(token.text);
    if (!target) continue;

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

    if (!matched || index >= boundaries.length) {
      unmatched.push(token.text);
      continue;
    }

    const boundary = boundaries[index];
    const spoken = comparable(boundary.text);
    const rest = spoken.slice(consumed);

    if (rest.startsWith(target)) {
      // The token sits inside this boundary; split the span by character count.
      const span = boundary.end - boundary.start;
      const scale = spoken.length > 0 ? span / spoken.length : 0;
      token.start = boundary.start + consumed * scale;
      token.end = boundary.start + (consumed + target.length) * scale;

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

      token.start = boundary.start;
      token.end = boundaries[last].end;
      index = last + 1;
      consumed = 0;
    }
  }

  const matched = tokens.filter((t) => t.start !== null).length;

  fillGaps(tokens);

  for (const s of sentences) {
    const timed = s.tokens.filter(
      (t): t is WordToken => t.kind === "word" && t.start !== null,
    );
    s.start = timed[0]?.start ?? null;
    s.end = timed.at(-1)?.end ?? null;
  }

  return { total: tokens.length, matched, unmatched };
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
function fillGaps(tokens: WordToken[]): void {
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].start !== null) continue;

    const previousEnd = tokens[i - 1]?.end ?? null;
    let nextStart: number | null = null;
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (tokens[j].start !== null) {
        nextStart = tokens[j].start;
        break;
      }
    }

    if (previousEnd !== null && nextStart !== null && nextStart > previousEnd) {
      tokens[i].start = previousEnd;
      tokens[i].end = nextStart;
    }
  }
}

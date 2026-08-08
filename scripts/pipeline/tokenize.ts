import type { Paragraph, Sentence, Token } from "../../shared/types.ts";

const sentenceSegmenter = new Intl.Segmenter("de", { granularity: "sentence" });
const wordSegmenter = new Intl.Segmenter("de", { granularity: "word" });

/**
 * Lookup key for a surface form: lowercased, stripped of surrounding
 * punctuation. Case is dropped so "Der"/"der" share one dictionary entry;
 * the lookup itself still tries the capitalized spelling (German nouns).
 */
export function wordKey(surface: string): string {
  return surface
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "");
}

/**
 * Splits the body into paragraphs -> sentences -> tokens.
 * Timings are left null; the aligner fills them in from TTS boundaries.
 */
export function tokenize(body: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  body.split(/\n\s*\n/).forEach((paragraphText, pIndex) => {
    const trimmed = paragraphText.trim();
    if (!trimmed) return;

    const sentences: Sentence[] = [];
    for (const { segment } of sentenceSegmenter.segment(trimmed)) {
      const sentenceText = segment.trim();
      if (!sentenceText) continue;

      const sIndex = sentences.length;
      const tokens: Token[] = [];
      let wIndex = 0;

      for (const part of wordSegmenter.segment(sentenceText)) {
        if (part.isWordLike) {
          tokens.push({
            kind: "word",
            id: `p${pIndex}s${sIndex}w${wIndex}`,
            text: part.segment,
            key: wordKey(part.segment),
            start: null,
            end: null,
          });
          wIndex += 1;
        } else {
          tokens.push({ kind: "punct", text: part.segment });
        }
      }

      sentences.push({
        id: `p${pIndex}s${sIndex}`,
        text: sentenceText,
        start: null,
        end: null,
        tokens,
      });
    }

    if (sentences.length > 0) {
      paragraphs.push({ id: `p${pIndex}`, sentences });
    }
  });

  return paragraphs;
}

export function countWords(paragraphs: Paragraph[]): number {
  return paragraphs.reduce(
    (total, p) =>
      total +
      p.sentences.reduce(
        (sum, s) => sum + s.tokens.filter((t) => t.kind === "word").length,
        0,
      ),
    0,
  );
}

/**
 * Unique dictionary keys in document order, each with the surface form best
 * suited for lookup. A sentence-initial word carries a capital that says
 * nothing about the word itself, so a mid-sentence spelling wins when we have
 * one — that is what distinguishes the noun "Sie" from the pronoun "sie".
 */
export function collectVocabulary(paragraphs: Paragraph[]): Map<string, string> {
  const preferred = new Map<string, string>();
  const fallback = new Map<string, string>();

  for (const p of paragraphs) {
    for (const s of p.sentences) {
      const firstWordIndex = s.tokens.findIndex((t) => t.kind === "word");
      s.tokens.forEach((token, index) => {
        if (token.kind !== "word" || !token.key) return;
        const target = index === firstWordIndex ? fallback : preferred;
        if (!target.has(token.key)) target.set(token.key, token.text);
      });
    }
  }

  const vocab = new Map<string, string>();
  for (const [key, surface] of [...fallback, ...preferred]) {
    vocab.set(key, surface);
  }
  return vocab;
}

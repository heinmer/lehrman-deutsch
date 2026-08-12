import fs from "node:fs/promises";
import path from "node:path";
import type { Paragraph } from "../../shared/types.ts";
import { PATHS } from "./config.ts";
import { normalizeBody, parseFrontMatter } from "./source.ts";

/**
 * A text's English rendering, written by hand beside the German in
 * content/translations/<slug>.md and read from there.
 *
 * It is source material and not the answer of a service: the build then needs
 * no network for this, no account and no provider's terms, and the English is
 * something the author can correct rather than something to be re-fetched. The
 * network path in translate.ts stays as the fallback for a text that has no
 * file here yet.
 */
export interface Translation {
  /** English title; null when the file carries no `title:`. */
  title: string | null;
  /** One entry per paragraph of the German, in the same order. */
  paragraphs: string[];
}

/** English, because this is the side being counted; the German has its own. */
const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

export function parseTranslation(raw: string): Translation {
  const { meta, body } = parseFrontMatter(raw);
  const normalized = normalizeBody(body);
  return {
    title: meta.title || null,
    paragraphs: normalized ? normalized.split(/\n\s*\n/) : [],
  };
}

/** Null when the text has no translation file — not an error, see translate.ts. */
export async function loadTranslation(
  slug: string,
  dir: string = PATHS.sourceTranslations,
): Promise<Translation | null> {
  try {
    return parseTranslation(await fs.readFile(path.join(dir, `${slug}.md`), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function countSentences(text: string): number {
  let count = 0;
  for (const { segment } of sentenceSegmenter.segment(text)) {
    if (segment.trim()) count += 1;
  }
  return count;
}

/** A paragraph whose two sides do not break into the same number of sentences. */
export interface SentenceMismatch {
  paragraph: string;
  german: number;
  english: number;
}

/**
 * Fills the paragraphs' `translation` in and reports where the two sides fall
 * out of step.
 *
 * A paragraph count that does not match is thrown rather than reported: the
 * blocks are shown one under the other, so a translation with a different
 * number of them is not a degraded text but a wrong one, and it can only come
 * from a German text edited without its English.
 *
 * Sentence counts are reported instead of thrown. The reader compares the two
 * blocks line by line, so sentences that were merged or split make the
 * translation much less useful — but the segmenter is a guess about prose, not
 * a rule, and a build should not die because it read one abbreviation as a
 * full stop. It goes in the log beside `aligned N/M`.
 */
export function applyTranslation(
  paragraphs: Paragraph[],
  translation: Translation,
): SentenceMismatch[] {
  if (translation.paragraphs.length !== paragraphs.length) {
    throw new Error(
      `translation has ${translation.paragraphs.length} paragraph(s) ` +
        `against the text's ${paragraphs.length}`,
    );
  }

  const mismatches: SentenceMismatch[] = [];
  paragraphs.forEach((paragraph, index) => {
    const english = translation.paragraphs[index];
    paragraph.translation = english;

    const count = countSentences(english);
    if (count !== paragraph.sentences.length) {
      mismatches.push({
        paragraph: paragraph.id,
        german: paragraph.sentences.length,
        english: count,
      });
    }
  });
  return mismatches;
}

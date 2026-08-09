import type { Paragraph, Sentence } from "./types.ts";

/**
 * The order the engine speaks a document in: the title first, then the body.
 *
 * This is the contract `alignTimings` walks — it consumes one flat list of
 * sentences alongside the engine's boundaries with a shared cursor, so a list
 * in any other order silently misplaces every timing after the first
 * disagreement. The build assembles it to synthesize and align; the app
 * assembles it again to know which word is being spoken. They have to be the
 * same list, which is why there is only one of it.
 *
 * Anything new that gets narrated belongs here, in the position it is read.
 */
export function narrationOrder(heading: Sentence, paragraphs: Paragraph[]): Sentence[] {
  return [heading, ...paragraphs.flatMap((paragraph) => paragraph.sentences)];
}

/**
 * The aligner is the one piece of the pipeline whose regressions are silent:
 * a wrong span does not throw, it just highlights the wrong word. These cases
 * are the ones the build log's `aligned N/M` line cannot tell apart.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { alignTimings } from "../scripts/pipeline/align.ts";
import type { Boundary } from "../scripts/pipeline/tts.ts";
import { tokenizeLine } from "../scripts/pipeline/tokenize.ts";
import type { Sentence } from "../shared/types.ts";

function boundary(text: string, start: number, end: number): Boundary {
  return { text, start, end };
}

function sentenceOf(text: string, id = "s0"): Sentence {
  return tokenizeLine(text, id);
}

test("one boundary per word gives each word its own span", () => {
  const sentences = [sentenceOf("Anna geht heim.")];
  const result = alignTimings(sentences, [
    boundary("Anna", 0, 0.5),
    boundary("geht", 0.5, 1),
    boundary("heim", 1, 1.5),
  ]);

  assert.equal(result.total, 3);
  assert.equal(result.matched, 3);
  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.spans["s0w0"], [0, 0.5]);
  assert.deepEqual(result.spans["s0w1"], [0.5, 1]);
  assert.deepEqual(result.spans["s0w2"], [1, 1.5]);
});

test("a sentence lasts from its first timed word to its last", () => {
  const sentences = [sentenceOf("Anna geht heim.")];
  const result = alignTimings(sentences, [
    boundary("Anna", 0, 0.5),
    boundary("geht", 0.5, 1),
    boundary("heim", 1, 1.5),
  ]);

  assert.deepEqual(result.spans["s0"], [0, 1.5]);
});

test("two words reported in one boundary are split by character count", () => {
  const sentences = [sentenceOf("Die Straße endet.")];
  // The engine merges the article into the noun, and spells ß as ss.
  const result = alignTimings(sentences, [
    boundary("Die Strasse", 0, 1),
    boundary("endet", 1, 1.5),
  ]);

  assert.equal(result.matched, 3);
  // "diestrasse" is ten characters; "die" is the first three of them.
  assert.deepEqual(result.spans["s0w0"], [0, 0.3]);
  assert.deepEqual(result.spans["s0w1"], [0.3, 1]);
  assert.deepEqual(result.spans["s0w2"], [1, 1.5]);
});

test("a word spread over several boundaries spans all of them", () => {
  const sentences = [sentenceOf("Donaudampfschiff fährt.")];
  const result = alignTimings(sentences, [
    boundary("Donau", 0, 0.4),
    boundary("dampf", 0.4, 0.8),
    boundary("schiff", 0.8, 1.2),
    boundary("fährt", 1.2, 1.6),
  ]);

  assert.equal(result.matched, 2);
  assert.deepEqual(result.spans["s0w0"], [0, 1.2]);
  assert.deepEqual(result.spans["s0w1"], [1.2, 1.6]);
});

test("ß and ss are the same word on either side of the comparison", () => {
  const sentences = [sentenceOf("Die Straße.")];
  const result = alignTimings(sentences, [
    boundary("Die", 0, 0.3),
    boundary("Strasse", 0.3, 1),
  ]);

  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.spans["s0w1"], [0.3, 1]);
});

test("a boundary the engine invented is skipped, not matched", () => {
  const sentences = [sentenceOf("Es ist fünf Uhr.")];
  const result = alignTimings(sentences, [
    boundary("Es", 0, 0.2),
    boundary("ist", 0.2, 0.4),
    boundary("fünf", 0.4, 0.8),
    // Nothing in the text corresponds to this one.
    boundary("Minuten", 0.8, 1.2),
    boundary("Uhr", 1.2, 1.5),
  ]);

  assert.equal(result.matched, 4);
  assert.deepEqual(result.spans["s0w3"], [1.2, 1.5]);
});

test("a word the engine skipped does not cost the next word its timing", () => {
  const sentences = [sentenceOf("Anna geht schnell heim.")];
  const result = alignTimings(sentences, [
    boundary("Anna", 0, 0.5),
    boundary("geht", 0.5, 1),
    // "schnell" is never reported.
    boundary("heim", 1.5, 2),
  ]);

  assert.deepEqual(result.unmatched, ["schnell"]);
  // The word after the gap keeps the boundary that is its own.
  assert.deepEqual(result.spans["s0w3"], [1.5, 2]);
});

test("a run of skipped words still leaves the cursor where the text resumes", () => {
  const sentences = [sentenceOf("Anna geht sehr schnell wieder heim.")];
  const result = alignTimings(sentences, [
    boundary("Anna", 0, 0.5),
    boundary("geht", 0.5, 1),
    boundary("heim", 2.5, 3),
  ]);

  assert.deepEqual(result.unmatched, ["sehr", "schnell", "wieder"]);
  assert.deepEqual(result.spans["s0w5"], [2.5, 3]);
});

test("an untimed word inherits the gap between its neighbours", () => {
  const sentences = [sentenceOf("Anna geht schnell heim.")];
  const result = alignTimings(sentences, [
    boundary("Anna", 0, 0.5),
    boundary("geht", 0.5, 1),
    boundary("heim", 1.5, 2),
  ]);

  // Counted as unmatched, but still highlightable rather than dead.
  assert.equal(result.matched, 3);
  assert.deepEqual(result.spans["s0w2"], [1, 1.5]);
});

test("the sentences are left untouched, so every voice aligns the same ones", () => {
  const sentences = [sentenceOf("Anna geht heim.")];
  const before = JSON.stringify(sentences);

  alignTimings(sentences, [boundary("Anna", 0, 0.5), boundary("geht", 0.5, 1)]);
  alignTimings(sentences, [boundary("Anna", 0, 0.9), boundary("geht", 0.9, 2)]);

  assert.equal(JSON.stringify(sentences), before);
});

test("aligning the same sentences twice gives each voice its own timings", () => {
  const sentences = [sentenceOf("Anna geht heim.")];
  const slow = alignTimings(sentences, [
    boundary("Anna", 0, 1),
    boundary("geht", 1, 2),
    boundary("heim", 2, 3),
  ]);
  const quick = alignTimings(sentences, [
    boundary("Anna", 0, 0.3),
    boundary("geht", 0.3, 0.6),
    boundary("heim", 0.6, 0.9),
  ]);

  assert.deepEqual(slow.spans["s0w0"], [0, 1]);
  assert.deepEqual(quick.spans["s0w0"], [0, 0.3]);
});

test("no boundaries at all is reported rather than guessed at", () => {
  const sentences = [sentenceOf("Anna geht heim.")];
  const result = alignTimings(sentences, []);

  assert.equal(result.matched, 0);
  assert.deepEqual(result.unmatched, ["Anna", "geht", "heim"]);
  assert.deepEqual(result.spans, {});
});

test("timings are rounded to the millisecond", () => {
  const sentences = [sentenceOf("Anna geht.")];
  const result = alignTimings(sentences, [
    boundary("Anna", 0.00049, 0.5004949),
    boundary("geht", 0.5004949, 1.0009),
  ]);

  assert.deepEqual(result.spans["s0w0"], [0, 0.5]);
  assert.deepEqual(result.spans["s0w1"], [0.5, 1.001]);
});

test("the title and the body are aligned as one stream, in narration order", () => {
  const sentences = [sentenceOf("Der See", "h0"), sentenceOf("Anna schwimmt.", "p0s0")];
  const result = alignTimings(sentences, [
    boundary("Der", 0, 0.3),
    boundary("See", 0.3, 0.8),
    boundary("Anna", 1.2, 1.6),
    boundary("schwimmt", 1.6, 2.2),
  ]);

  assert.equal(result.matched, 4);
  assert.deepEqual(result.spans["h0"], [0, 0.8]);
  assert.deepEqual(result.spans["p0s0"], [1.2, 2.2]);
});

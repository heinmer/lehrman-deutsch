import assert from "node:assert/strict";
import test from "node:test";
import { narrationOrder } from "../shared/narration.ts";
import type { Paragraph, Sentence, WordToken } from "../shared/types.ts";
import {
  collectVocabulary,
  countWords,
  tokenize,
  tokenizeLine,
  wordKey,
} from "../scripts/pipeline/tokenize.ts";

/** The body's sentences, in order — what the vocabulary is collected over. */
function bodySentences(paragraphs: Paragraph[]): Sentence[] {
  return paragraphs.flatMap((paragraph) => paragraph.sentences);
}

test("a lookup key drops case and the punctuation around a word", () => {
  assert.equal(wordKey("Der"), "der");
  assert.equal(wordKey("heim."), "heim");
  assert.equal(wordKey("»Guten«"), "guten");
  assert.equal(wordKey("Straße"), "straße");
  // Inner punctuation belongs to the word.
  assert.equal(wordKey("O'Brien"), "o'brien");
});

/** The words of a sentence, in order — punctuation carries no id. */
function words(sentence: Sentence): WordToken[] {
  return sentence.tokens.filter((t): t is WordToken => t.kind === "word");
}

test("word ids place a word in its paragraph and sentence", () => {
  const paragraphs = tokenize("Anna geht. Tom bleibt.\n\nEs regnet.");

  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0].sentences.length, 2);
  assert.equal(paragraphs[0].sentences[1].id, "p0s1");
  assert.equal(words(paragraphs[1].sentences[0])[0].id, "p1s0w0");
  assert.equal(words(paragraphs[0].sentences[1])[1].id, "p0s1w1");
});

test("punctuation is kept as its own token, so the text prints unchanged", () => {
  const [paragraph] = tokenize("Anna geht heim.");
  const printed = paragraph.sentences[0].tokens.map((t) => t.text).join("");

  assert.equal(printed, "Anna geht heim.");
});

test("only words are counted, and the title counts as content", () => {
  const heading = tokenizeLine("Ein Tag am See", "h0");
  const paragraphs = tokenize("Anna geht heim. Tom bleibt.");

  assert.equal(countWords([heading]), 4);
  assert.equal(countWords(narrationOrder(heading, paragraphs)), 9);
});

test("narration order is the title, then the body, in one flat list", () => {
  const heading = tokenizeLine("Der See", "h0");
  const paragraphs = tokenize("Anna schwimmt. Tom liest.\n\nEs regnet.");

  assert.deepEqual(
    narrationOrder(heading, paragraphs).map((sentence) => sentence.id),
    ["h0", "p0s0", "p0s1", "p1s0"],
  );
});

test("a mid-sentence spelling beats the capital a sentence start forces", () => {
  const sentences = bodySentences(tokenize("Sie geht. Dort steht sie."));
  const vocabulary = collectVocabulary(sentences);

  // Both spellings share one key; the one that says something wins.
  assert.equal(vocabulary.get("sie"), "sie");
});

test("a word only ever seen first in a sentence keeps that spelling", () => {
  const sentences = bodySentences(tokenize("Anna geht heim."));
  const vocabulary = collectVocabulary(sentences);

  assert.equal(vocabulary.get("anna"), "Anna");
});

test("the vocabulary is one entry per distinct key", () => {
  const sentences = bodySentences(tokenize("Der Mann und der Hund."));
  const vocabulary = collectVocabulary(sentences);

  assert.deepEqual([...vocabulary.keys()].sort(), ["der", "hund", "mann", "und"]);
});

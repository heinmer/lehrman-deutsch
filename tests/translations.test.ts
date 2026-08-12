import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Paragraph } from "../shared/types.ts";
import { tokenize } from "../scripts/pipeline/tokenize.ts";
import {
  applyTranslation,
  countSentences,
  loadTranslation,
  parseTranslation,
} from "../scripts/pipeline/translations.ts";

/** German paragraphs as the build has them: tokenized, translation still empty. */
function german(body: string): Paragraph[] {
  return tokenize(body);
}

test("front matter carries the title, blank lines separate the paragraphs", () => {
  const translation = parseTranslation(
    "---\ntitle: The First Snow\n---\n\nIt is winter.\n\nThe street is white.\n",
  );

  assert.equal(translation.title, "The First Snow");
  assert.deepEqual(translation.paragraphs, ["It is winter.", "The street is white."]);
});

test("a hard-wrapped paragraph is joined, exactly as the German is", () => {
  const translation = parseTranslation(
    "---\ntitle: T\n---\n\nIt is winter.\nAnna wakes up early.\n\nShe goes out.\n",
  );

  assert.deepEqual(translation.paragraphs, [
    "It is winter. Anna wakes up early.",
    "She goes out.",
  ]);
});

test("a file without a title is read, not rejected", () => {
  const translation = parseTranslation("It is winter.");

  assert.equal(translation.title, null);
  assert.deepEqual(translation.paragraphs, ["It is winter."]);
});

test("sentences are counted the way the reader sees them", () => {
  assert.equal(countSentences("It is winter."), 1);
  assert.equal(countSentences("It is winter. Anna wakes up early."), 2);
  // A quoted sentence closes with the quote, and belongs to the clause that
  // introduces it — the German is one sentence there too.
  assert.equal(countSentences('She smiles and says, "Good morning!" He pays by card.'), 2);
});

test("the English lands on the paragraphs it belongs to", () => {
  const paragraphs = german("Es ist Winter.\n\nDie Straße ist weiß.");
  const mismatches = applyTranslation(paragraphs, {
    title: "The First Snow",
    paragraphs: ["It is winter.", "The street is white."],
  });

  assert.deepEqual(mismatches, []);
  assert.deepEqual(
    paragraphs.map((p) => p.translation),
    ["It is winter.", "The street is white."],
  );
});

test("a paragraph that breaks into a different number of sentences is reported", () => {
  const paragraphs = german("Es ist Winter. Anna wacht früh auf.\n\nDie Straße ist weiß.");
  const mismatches = applyTranslation(paragraphs, {
    title: null,
    // Two German sentences told as one: the blocks no longer read line for line.
    paragraphs: ["It is winter and Anna wakes up early.", "The street is white."],
  });

  assert.deepEqual(mismatches, [{ paragraph: "p0", german: 2, english: 1 }]);
});

test("a mismatch is reported, not thrown — the translation is still applied", () => {
  const paragraphs = german("Es ist Winter. Anna wacht früh auf.");
  applyTranslation(paragraphs, {
    title: null,
    paragraphs: ["It is winter and Anna wakes up early."],
  });

  assert.equal(paragraphs[0].translation, "It is winter and Anna wakes up early.");
});

test("a different number of paragraphs is an error, not a degraded text", () => {
  const paragraphs = german("Es ist Winter.\n\nDie Straße ist weiß.");

  assert.throws(
    () => applyTranslation(paragraphs, { title: null, paragraphs: ["It is winter."] }),
    /translation has 1 paragraph\(s\) against the text's 2/,
  );
});

test("a text with no translation file is not an error", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lehrman-deutsch-"));
  try {
    await fs.writeFile(
      path.join(dir, "der-erste-schnee.md"),
      "---\ntitle: The First Snow\n---\n\nIt is winter.\n",
      "utf8",
    );

    const found = await loadTranslation("der-erste-schnee", dir);
    assert.equal(found?.title, "The First Snow");

    assert.equal(await loadTranslation("ein-tag-am-see", dir), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

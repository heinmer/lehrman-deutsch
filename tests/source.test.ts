import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadSourceTexts } from "../scripts/pipeline/source.ts";

/** Writes the given files into a throwaway directory and loads them. */
async function load(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "texts-in-german-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), body, "utf8");
    }
    return await loadSourceTexts(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const SIMPLE = `---
title: Ein Tag am See
level: A2
topic: Summer
---

Es ist Sommer.

Nach einer Stunde kommen sie an.
`;

test("front matter becomes the text's metadata", async () => {
  const [text] = await load({ "ein-tag-am-see.md": SIMPLE });

  assert.equal(text.title, "Ein Tag am See");
  assert.equal(text.level, "A2");
  assert.equal(text.topic, "Summer");
  assert.equal(text.slug, "ein-tag-am-see");
  assert.equal(text.rate, "-10%");
});

test("paragraphs are separated by blank lines and nothing else", async () => {
  const [text] = await load({ "a.md": SIMPLE });

  assert.deepEqual(text.body.split("\n\n"), [
    "Es ist Sommer.",
    "Nach einer Stunde kommen sie an.",
  ]);
});

test("a hard-wrapped paragraph is joined back into one line", async () => {
  const [text] = await load({
    "a.md": "---\ntitle: T\n---\n\nEs ist Sommer.\nLena fährt zum See.\n\nSie bleibt.\n",
  });

  assert.deepEqual(text.body.split("\n\n"), [
    "Es ist Sommer. Lena fährt zum See.",
    "Sie bleibt.",
  ]);
});

test("runs of blank lines are one paragraph break, not several", async () => {
  const [text] = await load({ "a.md": "---\ntitle: T\n---\n\nEins.\n\n\n\nZwei.\n" });

  assert.deepEqual(text.body.split("\n\n"), ["Eins.", "Zwei."]);
});

test("missing metadata falls back to the file name and A1", async () => {
  const [text] = await load({ "der-erste-schnee.md": "Es schneit." });

  assert.equal(text.title, "der-erste-schnee");
  assert.equal(text.level, "A1");
  assert.equal(text.slug, "der-erste-schnee");
  assert.equal(text.topic, undefined);
});

test("a level outside the CEFR scale is not taken at its word", async () => {
  const [text] = await load({ "a.md": "---\ntitle: T\nlevel: Z9\n---\n\nEs schneit.\n" });

  assert.equal(text.level, "A1");
});

test("a body of nothing but front matter is an error, not an empty text", async () => {
  await assert.rejects(
    () => load({ "a.md": "---\ntitle: T\n---\n\n\n" }),
    /no body text/,
  );
});

test("the hash follows the text, its title, its level and its rate", async () => {
  const base = "---\ntitle: T\nlevel: A1\n---\n\nEs schneit.\n";
  const [original] = await load({ "a.md": base });

  const [sameAgain] = await load({ "a.md": base });
  assert.equal(sameAgain.hash, original.hash, "an unchanged text keeps its hash");

  for (const changed of [
    "---\ntitle: T\nlevel: A1\n---\n\nEs regnet.\n",
    "---\ntitle: U\nlevel: A1\n---\n\nEs schneit.\n",
    "---\ntitle: T\nlevel: A2\n---\n\nEs schneit.\n",
    "---\ntitle: T\nlevel: A1\nrate: -25%\n---\n\nEs schneit.\n",
  ]) {
    const [other] = await load({ "a.md": changed });
    assert.notEqual(other.hash, original.hash);
  }
});

test("quotes around a front-matter value are not part of it", async () => {
  const [text] = await load({ "a.md": '---\ntitle: "Ein Tag"\n---\n\nEs schneit.\n' });

  assert.equal(text.title, "Ein Tag");
});

test("texts come back in a stable order regardless of when they were written", async () => {
  const body = "---\ntitle: T\n---\n\nEs schneit.\n";
  const texts = await load({ "zwei.md": body, "eins.md": body, "drei.md": body });

  assert.deepEqual(
    texts.map((t) => t.slug),
    ["drei", "eins", "zwei"],
  );
});

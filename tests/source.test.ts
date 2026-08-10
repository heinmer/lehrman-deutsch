import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  byCourseOrder,
  loadSourceTexts,
  type SourceText,
} from "../scripts/pipeline/source.ts";

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

test("the illustration is a bare file name, never a path out of content/images", async () => {
  const [plain] = await load({
    "a.md": "---\ntitle: T\nimage: schnee.png\n---\n\nEs schneit.\n",
  });
  assert.equal(plain.image, "schnee.png");

  const [escaping] = await load({
    "a.md": "---\ntitle: T\nimage: ../../secret.png\n---\n\nEs schneit.\n",
  });
  assert.equal(escaping.image, "secret.png");

  const [none] = await load({ "a.md": "---\ntitle: T\n---\n\nEs schneit.\n" });
  assert.equal(none.image, undefined);
});

test("a picture is not part of the hash — swapping one must not re-narrate", async () => {
  const [without] = await load({ "a.md": "---\ntitle: T\n---\n\nEs schneit.\n" });
  const [with_] = await load({
    "a.md": "---\ntitle: T\nimage: schnee.png\n---\n\nEs schneit.\n",
  });

  assert.equal(with_.hash, without.hash);
});

test("quotes around a front-matter value are not part of it", async () => {
  const [text] = await load({ "a.md": '---\ntitle: "Ein Tag"\n---\n\nEs schneit.\n' });

  assert.equal(text.title, "Ein Tag");
});

test("the place in the course is a number or an error, never a guess", async () => {
  const [placed] = await load({ "a.md": "---\ntitle: T\norder: 3\n---\n\nEs schneit.\n" });
  assert.equal(placed.order, 3);

  const [unplaced] = await load({ "a.md": "---\ntitle: T\n---\n\nEs schneit.\n" });
  assert.equal(unplaced.order, undefined);

  await assert.rejects(
    () => load({ "a.md": "---\ntitle: T\norder: erste\n---\n\nEs schneit.\n" }),
    /order "erste" is not a number/,
  );
});

test("where a text stands is not part of the hash — reordering must not re-narrate", async () => {
  const [without] = await load({ "a.md": "---\ntitle: T\n---\n\nEs schneit.\n" });
  const [with_] = await load({ "a.md": "---\ntitle: T\norder: 7\n---\n\nEs schneit.\n" });

  assert.equal(with_.hash, without.hash);
});

/** Only the fields byCourseOrder reads; the rest of a SourceText is noise here. */
function placed(level: SourceText["level"], title: string, order?: number): SourceText {
  return { level, title, order } as SourceText;
}

test("the course runs easiest level first, then the order the author set", () => {
  const texts = [
    placed("A2", "Zwei", 1),
    placed("A1", "Anfang", 2),
    placed("B1", "Drei", 1),
    placed("A1", "Zuerst", 1),
  ];

  assert.deepEqual(
    [...texts].sort(byCourseOrder).map((t) => t.title),
    ["Zuerst", "Anfang", "Zwei", "Drei"],
  );
});

test("a text with no place lands at the end of its level, not in the middle", () => {
  const texts = [
    placed("A1", "Ohne"),
    placed("A1", "Erste", 1),
    placed("A1", "Andere"),
    placed("A2", "Zweite", 1),
  ];

  assert.deepEqual(
    [...texts].sort(byCourseOrder).map((t) => t.title),
    ["Erste", "Andere", "Ohne", "Zweite"],
  );
});

test("levels sort by the CEFR scale and not by how their labels spell", () => {
  // The two agree for A1…C2, so the guard is that the comparison reads the
  // scale at all: a level later in LEVELS must not overtake an earlier one.
  const texts = [placed("C1", "C", 1), placed("A2", "A", 9), placed("B2", "B", 1)];

  assert.deepEqual(
    [...texts].sort(byCourseOrder).map((t) => t.level),
    ["A2", "B2", "C1"],
  );
});

test("texts come back in a stable order regardless of when they were written", async () => {
  const body = "---\ntitle: T\n---\n\nEs schneit.\n";
  const texts = await load({ "zwei.md": body, "eins.md": body, "drei.md": body });

  assert.deepEqual(
    texts.map((t) => t.slug),
    ["drei", "eins", "zwei"],
  );
});

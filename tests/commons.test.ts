import assert from "node:assert/strict";
import test from "node:test";
import { filePageUrl, plainText } from "../scripts/pipeline/commons.ts";
import { decodeEntities } from "../scripts/pipeline/util.ts";

test("the author comes back as a name, not as the markup around it", () => {
  assert.equal(
    plainText('<a href="//commons.wikimedia.org/wiki/User:Jeuwre" title="User:Jeuwre">Jeuwre</a>'),
    "Jeuwre",
  );
});

test("two links in one field do not run into each other", () => {
  // Commons often credits the microphone beside the person; stripping the tags
  // without putting a space in their place spelled the two as one word.
  assert.equal(
    plainText('<span>Own work</span>, recorded with <a href="#">Røde NT-USB</a>'),
    "Own work, recorded with Røde NT-USB",
  );
});

test("a field that is only markup is empty, not whitespace", () => {
  assert.equal(plainText("<span></span>"), "");
});

test("entities are spelled out, and an escaped one only once", () => {
  assert.equal(decodeEntities("Fischer &amp; Sohn"), "Fischer & Sohn");
  assert.equal(decodeEntities("&quot;Anna&quot;"), '"Anna"');
  // &amp;lt; is a literal "&lt;", and must not come back as "<".
  assert.equal(decodeEntities("&amp;lt;"), "&lt;");
});

test("the file page is a link a reader can follow", () => {
  assert.equal(
    filePageUrl("De-Anna2.ogg"),
    "https://commons.wikimedia.org/wiki/File:De-Anna2.ogg",
  );
});

test("a file name with spaces or umlauts survives being put in a URL", () => {
  assert.equal(
    filePageUrl("De-draußen.ogg"),
    "https://commons.wikimedia.org/wiki/File:De-drau%C3%9Fen.ogg",
  );
  assert.equal(
    filePageUrl("De at-Wien 2.ogg"),
    "https://commons.wikimedia.org/wiki/File:De_at-Wien_2.ogg",
  );
});

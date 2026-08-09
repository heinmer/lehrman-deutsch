import assert from "node:assert/strict";
import test from "node:test";
import { foldGerman, slugify } from "../scripts/pipeline/util.ts";

test("folding spells out the umlauts the engine is inconsistent about", () => {
  assert.equal(foldGerman("Straße"), "strasse");
  assert.equal(foldGerman("Strasse"), "strasse");
  assert.equal(foldGerman("Für Öl über"), "fuer oel ueber");
});

test("folding leaves anything it has no spelling for alone", () => {
  assert.equal(foldGerman("Café-Ecke"), "cafe-ecke");
  assert.equal(foldGerman("Anna 12"), "anna 12");
});

test("a slug is filesystem-safe and carries no leading or trailing dashes", () => {
  assert.equal(slugify("Ein Tag am See"), "ein-tag-am-see");
  assert.equal(slugify("Das Fahrrad meines Großvaters"), "das-fahrrad-meines-grossvaters");
  assert.equal(slugify("  ...Was nun?  "), "was-nun");
});

test("a slug cannot climb out of the directory it is joined to", () => {
  assert.equal(slugify("../../etc/passwd"), "etc-passwd");
  assert.equal(slugify("a/b\\c"), "a-b-c");
});

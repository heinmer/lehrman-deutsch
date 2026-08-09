/**
 * MyMemory answers short strings with a corpus match that simply echoes the
 * source. Titles came back untranslated until this guard existed, and it is
 * the kind of failure nobody notices in a build log.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { isEcho } from "../scripts/pipeline/translate.ts";

test("the German coming back unchanged is not a translation", () => {
  assert.equal(isEcho("Ein Tag am See", "Ein Tag am See"), true);
  assert.equal(isEcho("Ein Tag am See", "ein tag am see"), true);
  assert.equal(isEcho("Ein Tag am See", "  Ein  Tag am See "), true);
});

test("a fragment of the source coming back is not a translation either", () => {
  assert.equal(isEcho("Ein Tag am See", "Ein Tag"), true);
  assert.equal(isEcho("Der erste Schnee", "Schnee"), true);
});

test("an actual translation passes", () => {
  assert.equal(isEcho("Ein Tag am See", "A day at the lake"), false);
  assert.equal(isEcho("Der erste Schnee", "The first snow"), false);
});

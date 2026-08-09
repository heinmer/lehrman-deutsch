/**
 * Frame counting stands in for what the browser reports, and the sidebar and
 * the player disagree by a visible second whenever it is wrong.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { mp3DurationSec } from "../scripts/pipeline/mp3.ts";

/** MPEG 1 Layer III, 128 kbit/s, 44.1 kHz, unpadded: 417 bytes, 1152 samples. */
const FRAME_BYTES = 417;
const FRAME_SECONDS = 1152 / 44100;

function frames(count: number): Buffer {
  const buffer = Buffer.alloc(FRAME_BYTES * count);
  for (let i = 0; i < count; i += 1) {
    const at = i * FRAME_BYTES;
    buffer[at] = 0xff;
    buffer[at + 1] = 0xfb;
    buffer[at + 2] = 0x90;
    buffer[at + 3] = 0x00;
  }
  return buffer;
}

/** An ID3v2 header of `size` payload bytes, written as a syncsafe integer. */
function id3(size: number): Buffer {
  const tag = Buffer.alloc(10 + size);
  tag.write("ID3", 0, "latin1");
  tag[3] = 3;
  tag[6] = (size >> 21) & 0x7f;
  tag[7] = (size >> 14) & 0x7f;
  tag[8] = (size >> 7) & 0x7f;
  tag[9] = size & 0x7f;
  return tag;
}

test("the length of a file is the sum of its frames", () => {
  assert.equal(mp3DurationSec(frames(10)), FRAME_SECONDS * 10);
});

test("a leading ID3 tag is skipped rather than scanned", () => {
  const withTag = Buffer.concat([id3(200), frames(4)]);
  assert.equal(mp3DurationSec(withTag), FRAME_SECONDS * 4);
});

test("anything that is not MPEG audio counts as unknown", () => {
  assert.equal(mp3DurationSec(Buffer.from("not audio at all")), 0);
  assert.equal(mp3DurationSec(Buffer.alloc(0)), 0);
});

test("a padded frame is one byte longer and still lands on the next header", () => {
  const buffer = frames(3);
  // Padding bit set on the first frame; its length becomes 418.
  buffer[2] = 0x92;
  const shifted = Buffer.concat([
    buffer.subarray(0, FRAME_BYTES),
    Buffer.alloc(1),
    buffer.subarray(FRAME_BYTES),
  ]);

  assert.equal(mp3DurationSec(shifted), FRAME_SECONDS * 3);
});

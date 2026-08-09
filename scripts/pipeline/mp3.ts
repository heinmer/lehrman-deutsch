/**
 * How long an MP3 actually plays.
 *
 * The speech engine reports where each word begins, and the end of the last
 * word used to stand in for the length of the file. It is always short by the
 * breath of silence the encoder leaves at the end, which is why the sidebar
 * and the player disagreed by a second. Counting frames gives the same number
 * the browser reports.
 */

/** Layer III bitrates in kbit/s, indexed by the header's bitrate field. */
const BITRATES_MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

/** Sample rates by version field: 3 = MPEG 1, 2 = MPEG 2, 0 = MPEG 2.5. */
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/** Bytes of ID3v2 to skip, if the file starts with a tag. */
function tagLength(buffer: Buffer): number {
  if (buffer.length < 10 || buffer.toString("latin1", 0, 3) !== "ID3") return 0;
  // A syncsafe integer: seven bits per byte.
  const size =
    (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
  return 10 + size;
}

/**
 * Walks the frame headers and sums their playing time. Returns 0 for anything
 * that does not parse as MPEG audio, which the caller can treat as unknown.
 */
export function mp3DurationSec(buffer: Buffer): number {
  let offset = tagLength(buffer);
  let seconds = 0;

  while (offset + 4 <= buffer.length) {
    // Frame sync: eleven bits set.
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const version = (buffer[offset + 1] >> 3) & 0x03;
    const layer = (buffer[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
    const rateIndex = (buffer[offset + 2] >> 2) & 0x03;
    const padding = (buffer[offset + 2] >> 1) & 0x01;

    const rates = SAMPLE_RATES[version];
    // Layer III is 0b01; reserved values mean this was not a frame header.
    if (layer !== 1 || !rates || rateIndex === 3 || bitrateIndex === 0 || bitrateIndex === 15) {
      offset += 1;
      continue;
    }

    const sampleRate = rates[rateIndex];
    const bitrate =
      (version === 3 ? BITRATES_MPEG1[bitrateIndex] : BITRATES_MPEG2[bitrateIndex]) * 1000;
    // MPEG 1 fits twice as many samples into a frame as its later versions.
    const samplesPerFrame = version === 3 ? 1152 : 576;

    const length = Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;
    if (length <= 0) {
      offset += 1;
      continue;
    }

    seconds += samplesPerFrame / sampleRate;
    offset += length;
  }

  return seconds;
}

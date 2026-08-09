/**
 * Playback for the native-speaker word recordings.
 *
 * These come from many different contributors, so they arrive at wildly
 * different loudness and usually carry a moment of silence before the word.
 * Each clip is therefore decoded once, up front, then measured: playback
 * starts at the first real sound and is scaled towards a common loudness.
 * Decoding ahead of time is also what makes a click play instantly instead of
 * waiting on a fetch.
 */

interface PreparedClip {
  buffer: AudioBuffer;
  /** Gain that brings this clip towards the target loudness. */
  gain: number;
  /** Seconds of leading silence to skip. */
  offset: number;
  /** Seconds of audio to play from the offset. */
  duration: number;
}

/**
 * The loudness a clip is brought to, measured off the narrations so a word
 * does not jump out louder than the voice reading it: their speech sits
 * between 0.099 and 0.114 RMS depending on the voice.
 */
const TARGET_RMS = 0.11;
const MAX_GAIN = 8;
const MIN_GAIN = 0.4;
const PEAK_CEILING = 0.98;
/** Silence trimming keeps a little air so the onset is not clipped. */
const LEAD_IN = 0.015;
const TAIL = 0.06;

let context: AudioContext | null = null;
const prepared = new Map<string, PreparedClip>();
const inFlight = new Map<string, Promise<PreparedClip | null>>();

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

function analyse(buffer: AudioBuffer): PreparedClip {
  const samples = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i]);
    if (value > peak) peak = value;
  }

  const threshold = Math.max(peak * 0.02, 0.004);
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first += 1;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1;

  // All silence: play it as-is rather than nothing at all.
  if (first >= last) {
    return { buffer, gain: 1, offset: 0, duration: buffer.duration };
  }

  // Measured over the stretch that is actually played. Taking it over the
  // whole file instead let the half-second of silence in front of most of
  // these recordings drag the average down, and every clip came out louder
  // than the target by however much silence it happened to carry.
  let sumOfSquares = 0;
  for (let i = first; i <= last; i += 1) sumOfSquares += samples[i] * samples[i];
  const rms = Math.sqrt(sumOfSquares / (last - first + 1));

  let gain = rms > 0 ? TARGET_RMS / rms : 1;
  gain = Math.min(Math.max(gain, MIN_GAIN), MAX_GAIN);
  // Never push the loudest sample into clipping.
  if (peak * gain > PEAK_CEILING) gain = PEAK_CEILING / Math.max(peak, 1e-6);

  const rate = buffer.sampleRate;
  const offset = Math.max(0, first / rate - LEAD_IN);
  const end = Math.min(buffer.duration, last / rate + TAIL);

  return { buffer, gain, offset, duration: Math.max(end - offset, 0.05) };
}

async function load(src: string): Promise<PreparedClip | null> {
  const ctx = getContext();
  if (!ctx) return null;

  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    const clip = analyse(buffer);
    prepared.set(src, clip);
    return clip;
  } catch {
    return null;
  } finally {
    inFlight.delete(src);
  }
}

function ensureLoaded(src: string): Promise<PreparedClip | null> {
  const ready = prepared.get(src);
  if (ready) return Promise.resolve(ready);

  const existing = inFlight.get(src);
  if (existing) return existing;

  const promise = load(src);
  inFlight.set(src, promise);
  return promise;
}

/**
 * Decodes every clip of the current text in the background, a few at a time so
 * the narration's own download is not starved.
 */
export async function prefetchClips(sources: string[]): Promise<void> {
  const queue = [...new Set(sources)].filter((src) => !prepared.has(src));
  const BATCH = 6;

  for (let i = 0; i < queue.length; i += BATCH) {
    await Promise.all(queue.slice(i, i + BATCH).map(ensureLoaded));
  }
}

let activeSource: AudioBufferSourceNode | null = null;
/** The sidebar's output level, applied on top of each clip's own gain. */
let masterVolume = 1;

/** Sets the output level for word clips, 0–1. Takes effect on the next click. */
export function setClipVolume(value: number): void {
  masterVolume = Math.min(Math.max(value, 0), 1);
}

function start(ctx: AudioContext, clip: PreparedClip): void {
  activeSource?.stop();

  const source = ctx.createBufferSource();
  source.buffer = clip.buffer;

  const gain = ctx.createGain();
  gain.gain.value = clip.gain * masterVolume;

  source.connect(gain).connect(ctx.destination);
  source.onended = () => {
    if (activeSource === source) activeSource = null;
  };

  activeSource = source;
  source.start(0, clip.offset, clip.duration);
}

let fallback: HTMLAudioElement | null = null;

/** Plays a word recording, replacing whatever was playing. */
export function playClip(src: string): void {
  const ctx = getContext();
  if (!ctx) {
    fallback?.pause();
    fallback = new Audio(src);
    fallback.volume = masterVolume;
    void fallback.play();
    return;
  }

  // Browsers start the context suspended until a gesture; a click is one.
  if (ctx.state === "suspended") void ctx.resume();

  const ready = prepared.get(src);
  if (ready) {
    start(ctx, ready);
    return;
  }

  void ensureLoaded(src).then((clip) => {
    if (clip) start(ctx, clip);
  });
}

/**
 * Playback for the native-speaker word recordings.
 *
 * These come from many different contributors, so they arrive at wildly
 * different loudness and usually carry a moment of silence before the word.
 * Each clip is therefore decoded once, then measured: playback starts at the
 * first real sound and is scaled towards a common loudness.
 *
 * **A text's recordings are not all fetched when it opens.** They used to be —
 * a hundred and sixty files and three and a half megabytes for one A2 text,
 * decoded into float samples and kept forever, which on a phone is the tab
 * ending. Clips are warmed one at a time as the pointer or the focus reaches a
 * word, which is early enough that the click still plays from memory, and the
 * decoded ones are held in a bounded cache that drops the least recently used.
 */

import { assetUrl } from "./assets";

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
 * The loudness a clip is brought to: the level at which a word and the voice
 * reading the text measure the same. Set from the K-weighted loudness of both
 * paths in Chrome, where they now land within a tenth of a decibel of each
 * other. Firefox is not the reference — it plays the two paths at visibly
 * different levels from the same numbers.
 */
const TARGET_RMS = 0.088;
const MAX_GAIN = 8;
/**
 * How far a clip may be turned *down*. These recordings run up to 0.196 RMS,
 * so a floor near the target would leave the loudest fifth of them above it —
 * the ceiling this imposes is TARGET_RMS / MIN_GAIN.
 */
const MIN_GAIN = 0.1;
const PEAK_CEILING = 0.98;
/** Silence trimming keeps a little air so the onset is not clipped. */
const LEAD_IN = 0.015;
const TAIL = 0.06;

/**
 * How many decoded clips to keep. A decoded clip is float samples at the
 * context's rate — roughly a third of a megabyte for a second and a half —
 * so this is the difference between a bounded twenty-odd megabytes and
 * however many words the reader happens to visit.
 */
const MAX_DECODED = 80;

let context: AudioContext | null = null;
/** Least recently used first: Map iterates in insertion order. */
const prepared = new Map<string, PreparedClip>();
/** Clips exempt from eviction — the handful of voice samples. */
const pinned = new Set<string>();
const inFlight = new Map<string, Promise<PreparedClip | null>>();

/**
 * Bumped when the reader moves to another text. A decode still running for the
 * text they left is finished but not kept: it would evict something they are
 * about to want.
 */
let generation = 0;

function recall(src: string): PreparedClip | undefined {
  const clip = prepared.get(src);
  if (!clip) return undefined;
  // Re-inserting moves it to the young end of the map.
  prepared.delete(src);
  prepared.set(src, clip);
  return clip;
}

function remember(src: string, clip: PreparedClip): void {
  prepared.set(src, clip);
  for (const oldest of prepared.keys()) {
    if (prepared.size <= MAX_DECODED) break;
    if (!pinned.has(oldest)) prepared.delete(oldest);
  }
}

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

async function load(src: string, forGeneration: number): Promise<PreparedClip | null> {
  const ctx = getContext();
  if (!ctx) return null;

  try {
    // Clips are keyed by the path the data carries; only the request itself
    // needs to know where the site is actually served from.
    const response = await fetch(assetUrl(src));
    if (!response.ok) return null;
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    const clip = analyse(buffer);
    // Still playing it if it was asked for directly, just not keeping it.
    if (forGeneration === generation) remember(src, clip);
    return clip;
  } catch {
    return null;
  } finally {
    inFlight.delete(src);
  }
}

function ensureLoaded(src: string): Promise<PreparedClip | null> {
  const ready = recall(src);
  if (ready) return Promise.resolve(ready);

  const existing = inFlight.get(src);
  if (existing) return existing;

  const promise = load(src, generation);
  inFlight.set(src, promise);
  return promise;
}

/**
 * Fetches and decodes one clip ahead of being asked to play it — what the
 * reader's pointer or focus reaching a word is taken to mean. Cheap to call
 * repeatedly: a clip already held, or already on its way, is not fetched twice.
 */
export function warmClip(src: string): void {
  void ensureLoaded(src);
}

/**
 * Decodes a small, fixed set of clips and keeps them: the voice samples, which
 * are four files the picker plays and nothing evicts.
 */
export async function pinClips(sources: string[]): Promise<void> {
  for (const src of new Set(sources)) {
    pinned.add(src);
    await ensureLoaded(src);
  }
}

/**
 * Says that the reader has moved to another text. Decodes still in flight for
 * the old one are no longer worth keeping — they would evict clips from the
 * text now on screen.
 */
export function newTextOpened(): void {
  generation += 1;
}

/**
 * How many clips are currently decoded. The cache's ceiling is the whole point
 * of it and nothing else can observe it, so in dev it is reachable from the
 * console — which is how the browser checks read it.
 */
export function decodedClipCount(): number {
  return prepared.size;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).decodedClipCount = decodedClipCount;
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
    fallback = new Audio(assetUrl(src));
    fallback.volume = masterVolume;
    void fallback.play();
    return;
  }

  // Browsers start the context suspended until a gesture; a click is one.
  if (ctx.state === "suspended") void ctx.resume();

  const ready = recall(src);
  if (ready) {
    start(ctx, ready);
    return;
  }

  void ensureLoaded(src).then((clip) => {
    if (clip) start(ctx, clip);
  });
}

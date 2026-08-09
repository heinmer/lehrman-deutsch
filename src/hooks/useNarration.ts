import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Sentence, Span, TextDocument } from "../../shared/types";

interface TimedWord {
  wordId: string;
  sentenceId: string;
  start: number;
}

export interface Narration {
  isPlaying: boolean;
  isReady: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  activeWordId: string | null;
  activeSentenceId: string | null;
  toggle: () => void;
  /** Starts playback, whether or not it was already running. */
  play: () => void;
  /**
   * Moves the playhead without changing whether audio is playing. `fade` is
   * for jumps that land on a word: see the ramp below.
   */
  seek: (seconds: number, options?: { fade?: boolean }) => void;
  changeRate: (rate: number) => void;
  /**
   * Where a word begins in the voice currently playing, or null when this
   * reading has no timing for it.
   */
  wordStart: (wordId: string) => number | null;
}

function buildTimeline(
  sentences: Sentence[],
  spans: Record<string, Span>,
): TimedWord[] {
  const timeline: TimedWord[] = [];
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      if (token.kind !== "word") continue;
      const span = spans[token.id];
      if (span) {
        timeline.push({ wordId: token.id, sentenceId: sentence.id, start: span[0] });
      }
    }
  }
  return timeline.sort((a, b) => a.start - b.start);
}

/** Index of the last word that has started by `time`, or -1. */
function findActive(timeline: TimedWord[], time: number): number {
  let low = 0;
  let high = timeline.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timeline[mid].start <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

const NO_SENTENCES: Sentence[] = [];
const NO_SPANS: Record<string, Span> = {};

/**
 * How long playback takes to rise from silence when it starts somewhere in the
 * middle of the text.
 *
 * Words are not separated by silence: in the narrations, the 40ms before a
 * word's start is on median as loud as the word itself, because the previous
 * word's last sound runs into it. Beginning exactly at the boundary therefore
 * always catches a little of the word before, at full level, where it reads as
 * a stray syllable. Rising over this ramp turns it into an attack instead. The
 * timings themselves stay exactly as the engine reported them.
 */
const FADE_MS = 40;
const FADE_STEP_MS = 5;

/**
 * Drives the narration of one text in one voice, and reports which word is
 * being spoken.
 *
 * Position is polled with requestAnimationFrame rather than the audio
 * element's `timeupdate` event, which only fires about four times a second —
 * far too coarse to follow individual words.
 *
 * Changing the voice swaps the audio file underneath. Since no two voices
 * reach a given word at the same second, the position is carried across by
 * word rather than by time: the reader keeps their place in the text, and
 * playback that was running stays running.
 */
export function useNarration(
  document: TextDocument | null,
  voice: string,
  volume = 1,
): Narration {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  const track = useMemo(() => {
    if (!document) return null;
    // Data built before this voice existed still has to play something.
    return document.narrations[voice] ?? Object.values(document.narrations)[0] ?? null;
  }, [document, voice]);

  // Narration order: the title is spoken first, then the body.
  const sentences = useMemo(
    () =>
      document
        ? [document.heading, ...document.paragraphs.flatMap((p) => p.sentences)]
        : NO_SENTENCES,
    [document],
  );

  const spans = track?.spans ?? NO_SPANS;
  const timeline = useMemo(() => buildTimeline(sentences, spans), [sentences, spans]);

  // Read in the teardown below, which runs before the state of the render that
  // caused it has been applied anywhere else.
  const activeWordRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const resumeRef = useRef<{ wordId: string | null; playing: boolean } | null>(null);
  const slugRef = useRef<string | null>(null);

  // The level to end a fade on, read live so changing the volume mid-ramp is
  // not undone when the ramp finishes.
  const volumeRef = useRef(volume);
  const fadeRef = useRef<number | null>(null);

  const stopFade = useCallback(() => {
    if (fadeRef.current !== null) {
      window.clearInterval(fadeRef.current);
      fadeRef.current = null;
    }
  }, []);

  const fadeIn = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    stopFade();
    const startedAt = performance.now();
    audio.volume = 0;

    fadeRef.current = window.setInterval(() => {
      const current = audioRef.current;
      if (!current) return stopFade();

      const progress = Math.min((performance.now() - startedAt) / FADE_MS, 1);
      current.volume = volumeRef.current * progress;
      if (progress >= 1) stopFade();
    }, FADE_STEP_MS);
  }, [stopFade]);

  useEffect(() => {
    if (!track) return undefined;

    // Same text, new voice: pick the reading up where it was. A different text
    // starts at the beginning, and its word ids mean nothing here anyway.
    const slug = document?.slug ?? null;
    const resume = slugRef.current === slug ? resumeRef.current : null;
    slugRef.current = slug;
    resumeRef.current = null;

    const audio = new Audio(track.src);
    audio.preload = "auto";
    audio.playbackRate = rate;
    audio.volume = volume;
    audioRef.current = audio;

    const onLoaded = () => {
      setDuration(audio.duration);
      setIsReady(true);

      if (!resume) return;
      const start = resume.wordId ? track.spans[resume.wordId]?.[0] ?? null : null;
      if (start !== null) {
        audio.currentTime = start;
        setCurrentTime(start);
      }
      if (resume.playing) {
        fadeIn();
        void audio.play();
        setIsPlaying(true);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
      resumeRef.current = { wordId: activeWordRef.current, playing: playingRef.current };
      stopFade();
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
      setIsPlaying(false);
      setIsReady(false);
      setCurrentTime(0);
      setDuration(0);
    };
    // `rate` and `volume` are applied through their own effects; re-creating
    // the element on either would interrupt playback. They are read here only
    // so a text loaded later starts out with the current settings. The slug is
    // likewise only read, never a reason to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    volumeRef.current = volume;
    // A ramp in progress is heading for this level already; let it get there.
    if (audioRef.current && fadeRef.current === null) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!isPlaying) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return undefined;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (audio) setCurrentTime(audio.currentTime);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [isPlaying]);

  // Resuming also starts mid-word, so it gets the same ramp as a jump does.
  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      fadeIn();
      void audio.play();
      setIsPlaying(true);
    } else {
      stopFade();
      audio.volume = volumeRef.current;
      audio.pause();
      setIsPlaying(false);
    }
  }, [fadeIn, stopFade]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    fadeIn();
    void audio.play();
    setIsPlaying(true);
  }, [fadeIn]);

  const seek = useCallback(
    (seconds: number, options?: { fade?: boolean }) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = seconds;
      setCurrentTime(seconds);
      // Only while it is running: a paused seek is heard when play is pressed,
      // which fades on its own, and the scrubber would otherwise ramp on every
      // event of a drag.
      if (options?.fade && !audio.paused) fadeIn();
    },
    [fadeIn],
  );

  const wordStart = useCallback(
    (wordId: string) => spans[wordId]?.[0] ?? null,
    [spans],
  );

  const activeIndex = findActive(timeline, currentTime);
  const active = activeIndex >= 0 ? timeline[activeIndex] : null;

  useEffect(() => {
    activeWordRef.current = active?.wordId ?? null;
    playingRef.current = isPlaying;
  });

  return {
    isPlaying,
    isReady,
    currentTime,
    duration,
    rate,
    activeWordId: active?.wordId ?? null,
    activeSentenceId: active?.sentenceId ?? null,
    toggle,
    play,
    seek,
    changeRate: setRate,
    wordStart,
  };
}

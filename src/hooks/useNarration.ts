import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Paragraph } from "../../shared/types";

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
  seek: (seconds: number) => void;
  playFrom: (seconds: number) => void;
  changeRate: (rate: number) => void;
}

function buildTimeline(paragraphs: Paragraph[]): TimedWord[] {
  const timeline: TimedWord[] = [];
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.kind === "word" && token.start !== null) {
          timeline.push({
            wordId: token.id,
            sentenceId: sentence.id,
            start: token.start,
          });
        }
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

/**
 * Drives the single narration file and reports which word is being spoken.
 *
 * Position is polled with requestAnimationFrame rather than the audio
 * element's `timeupdate` event, which only fires about four times a second —
 * far too coarse to follow individual words.
 */
export function useNarration(src: string | null, paragraphs: Paragraph[]): Narration {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  const timeline = useMemo(() => buildTimeline(paragraphs), [paragraphs]);

  useEffect(() => {
    if (!src) return undefined;

    const audio = new Audio(src);
    audio.preload = "auto";
    audio.playbackRate = rate;
    audioRef.current = audio;

    const onLoaded = () => {
      setDuration(audio.duration);
      setIsReady(true);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
      setIsPlaying(false);
      setIsReady(false);
      setCurrentTime(0);
      setDuration(0);
    };
    // `rate` is applied through its own effect; re-creating the element on a
    // speed change would interrupt playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

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

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const playFrom = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
    void audio.play();
    setIsPlaying(true);
  }, []);

  const activeIndex = findActive(timeline, currentTime);
  const active = activeIndex >= 0 ? timeline[activeIndex] : null;

  return {
    isPlaying,
    isReady,
    currentTime,
    duration,
    rate,
    activeWordId: active?.wordId ?? null,
    activeSentenceId: active?.sentenceId ?? null,
    toggle,
    seek,
    playFrom,
    changeRate: setRate,
  };
}

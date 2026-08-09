import { useCallback, useEffect, useMemo, useState } from "react";

export interface VolumeSetting {
  /** 0–1, the level the slider shows. Kept while muted, so unmuting restores it. */
  volume: number;
  muted: boolean;
  /** What playback should actually use: 0 while muted. */
  effective: number;
  setVolume: (value: number) => void;
  toggleMuted: () => void;
}

const VOLUME_KEY = "volume";
const MUTED_KEY = "volume-muted";

function readVolume(fallback: number): number {
  const stored = localStorage.getItem(VOLUME_KEY);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

/**
 * The remembered output level, shared by the narration and the word clips.
 *
 * Mute is stored apart from the level rather than as a level of zero, so that
 * unmuting comes back to where the slider was left.
 */
export function useVolumeSetting(defaultVolume = 1): VolumeSetting {
  const [volume, setVolumeState] = useState(() => readVolume(defaultVolume));
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTED_KEY) === "on");

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    localStorage.setItem(MUTED_KEY, muted ? "on" : "off");
  }, [muted]);

  // Reaching for the slider is a request to hear something, so it also unmutes.
  const setVolume = useCallback((value: number) => {
    setVolumeState(Math.min(Math.max(value, 0), 1));
    setMuted(false);
  }, []);

  const toggleMuted = useCallback(() => setMuted((value) => !value), []);

  return useMemo(
    () => ({
      volume,
      muted,
      effective: muted ? 0 : volume,
      setVolume,
      toggleMuted,
    }),
    [volume, muted, setVolume, toggleMuted],
  );
}

import { useEffect, useState } from "react";
import { DEFAULT_VOICE, findVoice } from "../../shared/voices";

const KEY = "voice";

/**
 * The narration voice, remembered across sessions. A stored id that is no
 * longer in the roster falls back to the default rather than leaving the
 * reader with a text that cannot play.
 */
export function useVoiceSetting(): [string, (id: string) => void] {
  const [voice, setVoice] = useState<string>(() => {
    const stored = localStorage.getItem(KEY);
    return stored && findVoice(stored) ? stored : DEFAULT_VOICE;
  });

  useEffect(() => {
    localStorage.setItem(KEY, voice);
  }, [voice]);

  return [voice, setVoice];
}

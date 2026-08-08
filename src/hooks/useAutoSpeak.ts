import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "auto-speak";

/**
 * Whether clicking a word plays its recording while the narration is paused.
 * On by default — it is the main way to drill pronunciation word by word.
 */
export function useAutoSpeak(): { autoSpeak: boolean; toggleAutoSpeak: () => void } {
  const [autoSpeak, setAutoSpeak] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) !== "off",
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, autoSpeak ? "on" : "off");
  }, [autoSpeak]);

  const toggleAutoSpeak = useCallback(() => setAutoSpeak((previous) => !previous), []);

  return { autoSpeak, toggleAutoSpeak };
}

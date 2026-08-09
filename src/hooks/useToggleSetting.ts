import { useCallback, useEffect, useState } from "react";

/**
 * A remembered on/off preference. Stored as "on"/"off" so that an unset key
 * falls back to the default rather than reading as false.
 */
export function useToggleSetting(
  key: string,
  defaultOn = true,
): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultOn : stored === "on";
  });

  useEffect(() => {
    localStorage.setItem(key, enabled ? "on" : "off");
  }, [key, enabled]);

  const toggle = useCallback(() => setEnabled((value) => !value), []);

  return [enabled, toggle];
}

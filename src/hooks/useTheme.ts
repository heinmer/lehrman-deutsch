import { useEffect, useState } from "react";
import { DEFAULT_LIGHT, findTheme, type ThemeInfo } from "../lib/themes";

const STORAGE_KEY = "theme";

function initialTheme(): string {
  const stored = document.documentElement.dataset.theme;
  return stored && findTheme(stored) ? stored : DEFAULT_LIGHT;
}

export interface ThemeControls {
  themeId: string;
  theme: ThemeInfo | undefined;
  setTheme: (id: string) => void;
}

/**
 * The chosen theme is applied by an inline script in index.html before first
 * paint; this hook only keeps it in sync afterwards.
 */
export function useTheme(): ThemeControls {
  const [themeId, setThemeId] = useState<string>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    localStorage.setItem(STORAGE_KEY, themeId);
  }, [themeId]);

  return {
    themeId,
    theme: findTheme(themeId),
    setTheme: setThemeId,
  };
}

/**
 * The theme roster for the picker.
 *
 * Colours themselves live in src/styles/themes.css; the three swatch values
 * here are only for the preview dots, and must be kept in step with that file.
 */

export interface ThemeInfo {
  id: string;
  name: string;
  /** Groups the list and decides which theme a fresh visitor gets. */
  mode: "light" | "dark";
  /** [page ground, reading surface, accent] — drawn as the preview. */
  swatch: [string, string, string];
}

export const THEMES: readonly ThemeInfo[] = [
  {
    id: "daylight",
    name: "Daylight",
    mode: "light",
    swatch: ["#d7dce6", "#ffffff", "#5d6ba8"],
  },
  {
    id: "paper",
    name: "Paper",
    mode: "light",
    swatch: ["#e4e4e4", "#ffffff", "#1c1c1c"],
  },
  {
    id: "newsprint",
    name: "Newsprint",
    mode: "light",
    swatch: ["#ded7c9", "#faf6ed", "#8a5a2b"],
  },
  {
    id: "forest",
    name: "Forest",
    mode: "light",
    swatch: ["#ccd6c9", "#f9fbf7", "#3f6b4a"],
  },
  {
    id: "midnight",
    name: "Midnight",
    mode: "dark",
    swatch: ["#101119", "#1b1d24", "#98a4d8"],
  },
  {
    id: "ink",
    name: "Ink",
    mode: "dark",
    swatch: ["#000000", "#0a0a0a", "#ffffff"],
  },
  {
    id: "sepia",
    name: "Sepia",
    mode: "dark",
    swatch: ["#14110d", "#1a1611", "#c99a5b"],
  },
  {
    id: "dusk",
    name: "Dusk",
    mode: "dark",
    swatch: ["#0e1320", "#141a27", "#7aa2d8"],
  },
];

export const DEFAULT_LIGHT = "daylight";
export const DEFAULT_DARK = "midnight";

export function findTheme(id: string): ThemeInfo | undefined {
  return THEMES.find((theme) => theme.id === id);
}

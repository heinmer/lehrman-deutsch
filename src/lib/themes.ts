/**
 * The theme roster for the picker.
 *
 * Colours themselves live in src/styles/themes.css; the two swatch values here
 * only paint the preview dot, and must be kept in step with that file. The ids
 * are also repeated in the inline script in index.html.
 */

export interface ThemeInfo {
  id: string;
  name: string;
  /** Groups the picker, which draws a divider where this changes. */
  mode: "light" | "dark";
  /** [page ground, accent] — the two halves of the preview dot. */
  swatch: [string, string];
}

/** Dark themes first, then light; the picker shows them in this order. */
export const THEMES: readonly ThemeInfo[] = [
  { id: "midnight", name: "Midnight", mode: "dark", swatch: ["#0a0b11", "#98a4d8"] },
  { id: "dusk", name: "Dusk", mode: "dark", swatch: ["#080b14", "#7aa2d8"] },
  { id: "ink", name: "Ink", mode: "dark", swatch: ["#101a2e", "#8ba7e2"] },
  { id: "black", name: "Black", mode: "dark", swatch: ["#000000", "#93a2dd"] },
  { id: "daylight", name: "Daylight", mode: "light", swatch: ["#d7dce6", "#4d5b98"] },
  { id: "paper", name: "Paper", mode: "light", swatch: ["#f3ece0", "#8a4126"] },
  { id: "white", name: "White", mode: "light", swatch: ["#ffffff", "#44559f"] },
];

export const DEFAULT_LIGHT = "daylight";
export const DEFAULT_DARK = "midnight";

export function findTheme(id: string): ThemeInfo | undefined {
  return THEMES.find((theme) => theme.id === id);
}

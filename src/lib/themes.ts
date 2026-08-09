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
  /** [page ground, accent] — the two halves of the preview dot. */
  swatch: [string, string];
}

/** Light themes first, then dark; the picker shows them in this order. */
export const THEMES: readonly ThemeInfo[] = [
  { id: "daylight", name: "Daylight", swatch: ["#d7dce6", "#4d5b98"] },
  { id: "white", name: "White", swatch: ["#ffffff", "#000000"] },
  { id: "midnight", name: "Midnight", swatch: ["#0a0b11", "#98a4d8"] },
  { id: "dusk", name: "Dusk", swatch: ["#080b14", "#7aa2d8"] },
  { id: "black", name: "Black", swatch: ["#000000", "#ffffff"] },
];

export const DEFAULT_LIGHT = "daylight";
export const DEFAULT_DARK = "midnight";

export function findTheme(id: string): ThemeInfo | undefined {
  return THEMES.find((theme) => theme.id === id);
}

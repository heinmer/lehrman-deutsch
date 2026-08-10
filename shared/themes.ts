/**
 * The theme roster.
 *
 * Colours themselves live in src/styles/themes.css; the two swatch values here
 * only paint the preview dot, and must be kept in step with that file.
 *
 * It sits in shared/ because it is read twice: by the picker at run time, and
 * by `vite.config.ts` at build time, which writes the ids into the inline
 * script in index.html. That script has to know them before the bundle loads —
 * it is what applies the stored theme before first paint — and it used to
 * carry its own hand-copied list, which worked until reload after a theme was
 * added and then silently fell back.
 */

export interface ThemeInfo {
  id: string;
  name: string;
  /** Groups the picker, which draws a divider where this changes. */
  mode: "light" | "dark";
  /** [page ground, accent] — the two halves of the preview dot. */
  swatch: [string, string];
}

/**
 * Dark themes first, then light; the picker shows them in this order.
 *
 * Every one of them is a single sheet: page and reading sections share one
 * ground, with only the player lifted off it. The layered themes that tinted
 * each section separately were dropped, so a new theme joining this list is
 * expected to keep that arrangement.
 */
export const THEMES: readonly ThemeInfo[] = [
  { id: "ink", name: "Ink", mode: "dark", swatch: ["#101a2e", "#8ba7e2"] },
  { id: "black", name: "Black", mode: "dark", swatch: ["#000000", "#93a2dd"] },
  { id: "paper", name: "Paper", mode: "light", swatch: ["#f3ece0", "#8a4126"] },
  { id: "white", name: "White", mode: "light", swatch: ["#ffffff", "#44559f"] },
];

/**
 * What a reader who has never chosen gets. The system's colour scheme is not
 * consulted: this is a page of prose, and it opens as one sheet of paper.
 */
export const DEFAULT_THEME = "white";

export function findTheme(id: string): ThemeInfo | undefined {
  return THEMES.find((theme) => theme.id === id);
}

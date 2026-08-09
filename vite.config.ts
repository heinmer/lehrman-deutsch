import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_DARK, DEFAULT_LIGHT, THEMES } from "./shared/themes.ts";

/** The name the inline script in index.html expects to be filled in. */
const PLACEHOLDER = "__THEMES__";

/**
 * Writes the theme roster into the inline script in index.html.
 *
 * That script runs before the bundle, so it cannot import anything — it is
 * what applies the stored theme before first paint. It therefore used to carry
 * a hand-copied list of ids, and a theme added without updating it worked
 * until the next reload and then silently fell back. Now there is one list.
 */
function themeIds(): Plugin {
  return {
    name: "theme-ids",
    transformIndexHtml(html) {
      // replaceAll, not replace: the placeholder is mentioned in the comment
      // above it as well, and a single replacement filled in the comment and
      // left the code reading an undefined name.
      return html.replaceAll(
        PLACEHOLDER,
        JSON.stringify({
          known: THEMES.map((theme) => theme.id),
          light: DEFAULT_LIGHT,
          dark: DEFAULT_DARK,
        }),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), themeIds()],
  /**
   * Where the site will be served from. Everything the app requests is built
   * from this (see src/lib/assets.ts), so deploying under a prefix — a project
   * page, a preview URL, a proxy — is `BASE_PATH=/texts-in-german/ npm run
   * build` and nothing else.
   */
  base: process.env.BASE_PATH ?? "/",
  server: {
    port: 5173,
  },
});

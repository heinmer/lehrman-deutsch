import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_THEME, THEMES } from "./shared/themes.ts";

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
          fallback: DEFAULT_THEME,
        }),
      );
    },
  };
}

/** What is worth compressing. mp3 is already compressed; squeezing it again
 *  costs build time and gives back nothing. */
const COMPRESSIBLE = new Set([".json", ".js", ".css", ".html", ".svg"]);
/** Below this, the compressed copy tends to be no smaller than the original. */
const MIN_BYTES = 1024;

/**
 * Writes a .br and a .gz beside every compressible file in the build.
 *
 * These are inert unless the host is told to prefer them — nginx
 * `brotli_static`/`gzip_static`, Caddy's `precompressed`, and similar. Where
 * they are used, the generated data goes from about 780 bytes per word to 160,
 * and the app is unchanged: it asks for the same URLs either way.
 *
 * Hosts that compress on the fly ignore these; the cost is a few hundred
 * kilobytes in dist and a second of build time.
 */
function precompress(): Plugin {
  let outDir = "dist";

  async function walk(dir: string): Promise<string[]> {
    const found: string[] = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) found.push(...(await walk(full)));
      else found.push(full);
    }
    return found;
  }

  return {
    name: "precompress",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    // After the bundle *and* after public/ has been copied across.
    async closeBundle() {
      let saved = 0;
      let count = 0;

      for (const file of await walk(outDir)) {
        if (!COMPRESSIBLE.has(path.extname(file))) continue;
        if (file.endsWith(".br") || file.endsWith(".gz")) continue;

        const source = await fs.readFile(file);
        if (source.length < MIN_BYTES) continue;

        const brotli = zlib.brotliCompressSync(source, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
          },
        });
        const gzip = zlib.gzipSync(source, { level: 9 });

        await fs.writeFile(`${file}.br`, brotli);
        await fs.writeFile(`${file}.gz`, gzip);
        saved += source.length - brotli.length;
        count += 1;
      }

      this.info(
        `precompress: ${count} file(s), ${(saved / 1024 / 1024).toFixed(1)} MB smaller over brotli`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), themeIds(), precompress()],
  /**
   * Where the site will be served from. Everything the app requests is built
   * from this (see src/lib/assets.ts), so deploying under a prefix — a project
   * page, a preview URL, a proxy — is `BASE_PATH=/lehrman-deutsch/ npm run
   * build` and nothing else.
   */
  base: process.env.BASE_PATH ?? "/",
  server: {
    port: 5173,
  },
});

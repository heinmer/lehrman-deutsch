import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PATHS } from "./config.ts";
import { fetchWithRetry, NotFoundError } from "./http.ts";
import { ensureDir, exists, log, slugify } from "./util.ts";

/**
 * German Wiktionary as a fallback for transcriptions.
 *
 * English Wiktionary rarely transcribes inflected spellings — "bleibt",
 * "denkt", "warmen" have none — while the German edition transcribes them
 * routinely, in the same IPA.
 */

const cacheDir = path.join(PATHS.cache, "dewiktionary");

const API = "https://de.wiktionary.org/w/api.php";

function cacheFileFor(word: string): string {
  const digest = crypto.createHash("sha1").update(word).digest("hex").slice(0, 8);
  return path.join(cacheDir, `${slugify(word) || "x"}-${digest}.txt`);
}

async function fetchWikitext(word: string): Promise<string> {
  await ensureDir(cacheDir);
  const cacheFile = cacheFileFor(word);

  if (await exists(cacheFile)) {
    return fs.readFile(cacheFile, "utf8");
  }

  const url =
    `${API}?action=parse&page=${encodeURIComponent(word)}` +
    `&prop=wikitext&format=json&formatversion=2`;

  let wikitext = "";
  try {
    const response = await fetchWithRetry(url);
    const payload = (await response.json()) as {
      parse?: { wikitext?: string };
      error?: unknown;
    };
    wikitext = payload.parse?.wikitext ?? "";
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      log.warn(`de.wiktionary ${word}: ${(error as Error).message}`);
      return "";
    }
  }

  await fs.writeFile(cacheFile, wikitext, "utf8");
  return wikitext;
}

/**
 * Returns the first transcription on the page, without its wrapper. German
 * Wiktionary marks these up as {{Lautschrift|…}}.
 */
export async function fetchGermanIpa(word: string): Promise<string | null> {
  const wikitext = await fetchWikitext(word);
  if (!wikitext) return null;

  for (const match of wikitext.matchAll(/\{\{Lautschrift\|([^}|]+)\}\}/g)) {
    const value = match[1].trim();
    // Placeholder entries exist where nobody has filled the sound in yet.
    if (value && value !== "…" && value !== "...") return value;
  }
  return null;
}

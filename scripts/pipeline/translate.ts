import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PATHS } from "./config.ts";
import { fetchWithRetry } from "./http.ts";
import { ensureDir, exists, log } from "./util.ts";

/**
 * Paragraph translations, used for the "show me what this says" toggle.
 *
 * DeepL is used when DEEPL_API_KEY is set — it handles German word order and
 * separable verbs noticeably better. Without a key it falls back to MyMemory,
 * which needs no credentials and is good enough for short, simple texts.
 */

const cacheDir = path.join(PATHS.cache, "translations");

function cacheFileFor(text: string, provider: string): string {
  const digest = crypto.createHash("sha1").update(`${provider}:${text}`).digest("hex");
  return path.join(cacheDir, `${digest.slice(0, 16)}.txt`);
}

async function translateWithDeepl(text: string, key: string): Promise<string | null> {
  // Free-tier keys end in ":fx" and use a separate host.
  const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const body = new URLSearchParams({
    text,
    source_lang: "DE",
    target_lang: "EN",
  });

  const response = await fetchWithRetry(`https://${host}/v2/translate?${body.toString()}`, {
    headers: { Authorization: `DeepL-Auth-Key ${key}` },
  });
  const payload = (await response.json()) as { translations?: Array<{ text: string }> };
  return payload.translations?.[0]?.text ?? null;
}

async function translateWithMyMemory(text: string): Promise<string | null> {
  const url =
    "https://api.mymemory.translated.net/get" +
    `?q=${encodeURIComponent(text)}&langpair=de|en`;

  const response = await fetchWithRetry(url);
  const payload = (await response.json()) as {
    responseStatus?: number | string;
    responseData?: { translatedText?: string };
  };

  if (Number(payload.responseStatus) !== 200) return null;
  const translated = payload.responseData?.translatedText;
  return translated ? decodeEntities(translated) : null;
}

/** The service returns HTML entities for quotes and ampersands. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function translateToEnglish(text: string): Promise<string | null> {
  const key = process.env.DEEPL_API_KEY;
  const provider = key ? "deepl" : "mymemory";

  await ensureDir(cacheDir);
  const cacheFile = cacheFileFor(text, provider);
  if (await exists(cacheFile)) {
    return fs.readFile(cacheFile, "utf8");
  }

  let translated: string | null = null;
  try {
    translated = key
      ? await translateWithDeepl(text, key)
      : await translateWithMyMemory(text);
  } catch (error) {
    log.warn(`translation failed: ${(error as Error).message}`);
    return null;
  }

  if (!translated) return null;

  await fs.writeFile(cacheFile, translated, "utf8");
  return translated;
}

export function translationProvider(): string {
  return process.env.DEEPL_API_KEY ? "DeepL" : "MyMemory";
}

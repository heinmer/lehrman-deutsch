import fs from "node:fs/promises";
import path from "node:path";
import type { AudioClip } from "../../shared/types.ts";
import { PATHS } from "./config.ts";
import { fetchWithRetry } from "./http.ts";
import type { RawSound } from "./wiktionary.ts";
import { ensureDir, exists, log, slugify } from "./util.ts";

function localName(sound: RawSound): string {
  const extension = path.extname(new URL(sound.url).pathname) || ".mp3";
  const base = sound.file.replace(/\.[^.]+$/, "");
  return `${slugify(base) || "clip"}${extension}`;
}

/**
 * Downloads a Wikimedia Commons recording into public/media/words so the site
 * works offline. Returns null if the file cannot be fetched.
 */
export async function downloadWordAudio(sound: RawSound): Promise<AudioClip | null> {
  await ensureDir(PATHS.mediaWords);

  const name = localName(sound);
  const target = path.join(PATHS.mediaWords, name);
  const clip: AudioClip = {
    src: `/media/words/${name}`,
    tags: sound.tags,
    file: sound.file,
  };

  if (await exists(target)) return clip;

  try {
    const response = await fetchWithRetry(sound.url);
    await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
    return clip;
  } catch (error) {
    log.warn(`audio ${sound.file}: ${(error as Error).message}`);
    return null;
  }
}

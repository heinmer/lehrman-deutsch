import crypto from "node:crypto";
import path from "node:path";
import type { ClipCredit } from "../../shared/types.ts";
import { PATHS } from "./config.ts";
import { fetchWithRetry } from "./http.ts";
import { decodeEntities, ensureDir, log, readJson, slugify, writeJson } from "./util.ts";

/**
 * Who recorded the words, and under what licence.
 *
 * The recordings are volunteer contributions under CC BY-SA for the most part,
 * which asks for the author's name, the licence and a link back whenever the
 * work is *distributed* — which is what a published site does. The pipeline
 * downloaded them without ever asking who made them; this is where that is put
 * right.
 */

const API = "https://commons.wikimedia.org/w/api.php";

/** Titles the API takes in one query from an anonymous client. */
const BATCH = 50;

const cacheDir = path.join(PATHS.cache, "commons");

/** Named like the dewiktionary cache: readable stem, hash for the collisions. */
function cacheFileFor(file: string): string {
  const digest = crypto.createHash("sha1").update(file).digest("hex").slice(0, 8);
  const stem = slugify(file.replace(/\.[^.]+$/, "")) || "clip";
  return path.join(cacheDir, `${stem}-${digest}.json`);
}

export function filePageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
}

/**
 * Commons returns the author as a fragment of HTML — usually a link to the
 * uploader's user page, sometimes with a second link for the microphone they
 * used. What the panel wants is the name, so the markup is taken off and the
 * whitespace it leaves behind collapsed.
 */
export function plainText(value: string): string {
  return (
    decodeEntities(value.replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      // A tag becomes a space so that two links do not run into one word; where
      // the tag closed in front of punctuation that space is not wanted.
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim()
  );
}

interface ApiPage {
  title: string;
  missing?: boolean;
  imageinfo?: Array<{ extmetadata?: Record<string, { value?: unknown }> }>;
}

function creditFrom(file: string, page: ApiPage): ClipCredit {
  const meta = page.imageinfo?.[0]?.extmetadata ?? {};
  const field = (key: string): string | null => {
    // Every field read here is a string when it is there at all; anything else
    // is a shape we do not know, and guessing at it would print [object Object]
    // into the credits.
    const value = meta[key]?.value;
    if (typeof value !== "string") return null;
    return plainText(value) || null;
  };

  return {
    file,
    author: field("Artist"),
    license: field("LicenseShortName"),
    licenseUrl: field("LicenseUrl"),
    page: filePageUrl(file),
  };
}

/**
 * Credits for the given Commons file names, cached one file per recording.
 *
 * Only a definitive answer is cached — a page that came back, present or
 * missing. A request that failed is left uncached and simply has no credit
 * this run, for the reason the dictionary lookups have: writing "no such
 * thing" for what was really a rate limit is how a word silently loses its
 * entry and never gets it back.
 */
export async function fetchCredits(files: string[]): Promise<Record<string, ClipCredit>> {
  await ensureDir(cacheDir);

  const credits: Record<string, ClipCredit> = {};
  const wanted: string[] = [];

  for (const file of files) {
    const cached = await readJson<ClipCredit>(cacheFileFor(file));
    if (cached) credits[file] = cached;
    else wanted.push(file);
  }

  if (wanted.length > 0) {
    log.info(`asking Commons about ${wanted.length} recording(s)...`);
  }

  for (let start = 0; start < wanted.length; start += BATCH) {
    const batch = wanted.slice(start, start + BATCH);
    const titles = batch.map((file) => `File:${file}`).join("|");
    const url =
      `${API}?action=query&format=json&formatversion=2` +
      `&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(titles)}`;

    interface ApiReply {
      query?: { normalized?: Array<{ from: string; to: string }>; pages?: ApiPage[] };
    }

    let payload: ApiReply;
    try {
      payload = (await (await fetchWithRetry(url)).json()) as ApiReply;
    } catch (error) {
      log.warn(`commons: ${(error as Error).message}`);
      continue;
    }

    // The API normalises a title before answering — underscores for spaces, and
    // the first letter capitalised — so a page comes back under a name that is
    // not always the one asked for. This is the way back to it.
    const asked = new Map<string, string>();
    for (const file of batch) asked.set(`File:${file}`, file);
    for (const { from, to } of payload.query?.normalized ?? []) {
      const original = asked.get(from);
      if (original) asked.set(to, original);
    }

    for (const page of payload.query?.pages ?? []) {
      const file = asked.get(page.title);
      if (!file) continue;

      const credit = creditFrom(file, page);
      credits[file] = credit;
      await writeJson(cacheFileFor(file), credit);
    }
  }

  return credits;
}

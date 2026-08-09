import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Writes JSON, indented by default.
 *
 * `pretty: false` is for the files the *app* downloads. Indentation more than
 * doubled them — 1690 bytes per word against 780 — and nothing reads them by
 * eye: the build logs what is worth checking, and `npm run content` is what
 * regenerates them. Bookkeeping under .cache/ stays indented, because that one
 * is read by a person debugging an incremental build.
 */
export async function writeJson(
  file: string,
  value: unknown,
  { pretty = true }: { pretty?: boolean } = {},
): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(value, null, pretty ? 2 : undefined), "utf8");
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const TRANSLITERATION: Record<string, string> = {
  "ä": "ae",
  "ö": "oe",
  "ü": "ue",
  "ß": "ss",
  "é": "e",
  "è": "e",
  "ê": "e",
  "á": "a",
  "à": "a",
  "â": "a",
  "ç": "c",
  "ñ": "n",
};

/**
 * Lowercases and spells out umlauts and eszett. The speech engine is not
 * consistent about which spelling it reports ("Straße" or "Strasse"), so both
 * sides of any comparison are folded through this first.
 */
export function foldGerman(input: string): string {
  return input.toLowerCase().replace(/./gu, (char) => TRANSLITERATION[char] ?? char);
}

/** Filesystem-safe, lowercase name derived from German text. */
export function slugify(input: string): string {
  return foldGerman(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const log = {
  step: (msg: string) => console.log(`\n${msg}`),
  info: (msg: string) => console.log(`  ${msg}`),
  ok: (msg: string) => console.log(`  + ${msg}`),
  warn: (msg: string) => console.log(`  ! ${msg}`),
  fail: (msg: string) => console.log(`  x ${msg}`),
};

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

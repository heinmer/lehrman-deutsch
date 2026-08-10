import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { LEVELS, type Level } from "../../shared/types.ts";
import { VOICES } from "../../shared/voices.ts";
import { DEFAULT_RATE, PATHS, PIPELINE_VERSION } from "./config.ts";
import { slugify } from "./util.ts";

export interface SourceText {
  slug: string;
  title: string;
  level: Level;
  topic?: string;
  /** Applies to every voice; the reader chooses the voice, not the text. */
  rate: string;
  /** File name of the header illustration in content/images; absent when none. */
  image?: string;
  /**
   * Where the text sits inside its level, lowest first; absent when it has
   * not been placed. Like the picture, it is not in the hash — the narration
   * and the dictionary do not depend on where a text stands in the list, so
   * reordering the course is an index rewrite and nothing else.
   */
  order?: number;
  /** Body with paragraphs separated by blank lines. */
  body: string;
  file: string;
  /** Changes whenever the text or its narration settings change. */
  hash: string;
}

/** An unplaced text sorts after every placed one, not before them. */
function placement(text: SourceText): number {
  return text.order ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The order the sidebar reads in: easiest level first, and within a level the
 * order the course was written in rather than the alphabet — the texts of one
 * level build on each other, which is something only the author knows.
 *
 * A text carrying no `order:` falls to the end of its level, alphabetically
 * among its like: a text that has not been placed yet must not land in the
 * middle of a sequence that was.
 *
 * Levels compare by their position in LEVELS and not as strings. The two
 * agree today — "A1" … "C2" happen to sort alphabetically into the CEFR scale
 * — but that is a coincidence of the labels, and one "B1+" would end it.
 */
export function byCourseOrder(a: SourceText, b: SourceText): number {
  return (
    LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) ||
    placement(a) - placement(b) ||
    a.title.localeCompare(b.title, "de")
  );
}

/**
 * Minimal front-matter parser: a `---` fenced block of `key: value` lines.
 * Deliberately not YAML — texts only need a handful of flat string fields.
 */
function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { meta: {}, body: raw.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
    if (key) meta[key] = value;
  }
  return { meta, body: raw.slice(match[0].length).trim() };
}

function normalizeBody(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    // Collapse runs of blank lines into a single paragraph break.
    .replace(/\n{3,}/g, "\n\n")
    // Join lines inside a paragraph so sentence segmentation is not confused
    // by hard-wrapped source files.
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split("\n").map((l) => l.trim()).join(" ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** The directory is a parameter so the loader can be exercised on fixtures. */
export async function loadSourceTexts(dir: string = PATHS.source): Promise<SourceText[]> {
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".md"))
    .sort();

  const texts: SourceText[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const raw = await fs.readFile(full, "utf8");
    const { meta, body } = parseFrontMatter(raw);

    const title = meta.title ?? path.basename(file, ".md");
    const level = (LEVELS as readonly string[]).includes(meta.level)
      ? (meta.level as Level)
      : "A1";
    const rate = meta.rate || DEFAULT_RATE;
    const normalized = normalizeBody(body);

    if (!normalized) {
      throw new Error(`${file}: no body text`);
    }

    // Always through slugify, never taken at its word: the slug names a file
    // under public/ and a segment of a URL, and `slug: ../../x` in front
    // matter would write outside the output directory.
    const slug = slugify(meta.slug || path.basename(file, ".md"));
    if (!slug) {
      throw new Error(`${file}: slug "${meta.slug}" has nothing usable in it`);
    }
    // A number or nothing at all. `order: fisrt` is not worth guessing at:
    // whatever it were taken to mean, the text would sort to one end of its
    // level and look placed, which is the quiet kind of wrong.
    let order: number | undefined;
    if (meta.order !== undefined) {
      order = Number(meta.order);
      if (!Number.isFinite(order)) {
        throw new Error(`${file}: order "${meta.order}" is not a number`);
      }
    }

    const clash = texts.find((text) => text.slug === slug);
    if (clash) {
      throw new Error(
        `${file}: slug "${slug}" is already taken by ${path.basename(clash.file)}`,
      );
    }

    texts.push({
      slug,
      title,
      level,
      topic: meta.topic || undefined,
      // A bare file name, like the slug and for the same reason: it names a
      // file that is copied under public/, so `image: ../../secret.png` must
      // not reach outside content/images. That the file exists is the build's
      // business, not the loader's.
      image: meta.image ? path.basename(meta.image) : undefined,
      order,
      rate,
      body: normalized,
      file: full,
      // The voice roster is part of the hash, so adding a voice rebuilds the
      // narrations without anyone having to remember PIPELINE_VERSION. Sorted,
      // because which voices exist matters and their order in the picker
      // does not.
      hash: crypto
        .createHash("sha1")
        .update(
          `v${PIPELINE_VERSION} ${normalized} ${VOICES.map((v) => v.id).sort().join(",")} ` +
            `${rate} ${title} ${level}`,
        )
        .digest("hex")
        .slice(0, 12),
    });
  }
  return texts;
}

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
  /** Body with paragraphs separated by blank lines. */
  body: string;
  file: string;
  /** Changes whenever the text or its narration settings change. */
  hash: string;
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

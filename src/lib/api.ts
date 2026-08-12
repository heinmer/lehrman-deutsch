import type { CreditsIndex, TextDocument, TextIndex } from "../../shared/types";
import { assetUrl } from "./assets";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function fetchTextIndex(): Promise<TextIndex> {
  return getJson<TextIndex>(assetUrl("/data/index.json"));
}

export function fetchTextDocument(slug: string): Promise<TextDocument> {
  return getJson<TextDocument>(assetUrl(`/data/texts/${encodeURIComponent(slug)}.json`));
}

/** Who recorded each word, and under what licence. One file for the whole site. */
export function fetchCreditsIndex(): Promise<CreditsIndex> {
  return getJson<CreditsIndex>(assetUrl("/data/credits.json"));
}

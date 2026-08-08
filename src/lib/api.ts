import type { TextDocument, TextIndex } from "../../shared/types";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function fetchTextIndex(): Promise<TextIndex> {
  return getJson<TextIndex>("/data/index.json");
}

export function fetchTextDocument(slug: string): Promise<TextDocument> {
  return getJson<TextDocument>(`/data/texts/${slug}.json`);
}

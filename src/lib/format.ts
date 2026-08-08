/** Wiktionary part-of-speech codes, spelled out for the reader. */
const POS_LABELS: Record<string, string> = {
  noun: "noun",
  verb: "verb",
  adj: "adjective",
  adv: "adverb",
  pron: "pronoun",
  det: "determiner",
  article: "article",
  prep: "preposition",
  postp: "postposition",
  conj: "conjunction",
  num: "numeral",
  particle: "particle",
  intj: "interjection",
  name: "proper noun",
  prefix: "prefix",
  suffix: "suffix",
  contraction: "contraction",
  phrase: "phrase",
  prep_phrase: "prepositional phrase",
  character: "character",
};

export function posLabel(pos: string): string {
  return POS_LABELS[pos] ?? pos.replace(/_/g, " ");
}

/** The definite article that goes with a noun's gender — worth memorising. */
export function genderArticle(gender: string | null): string | null {
  switch (gender) {
    case "masculine":
      return "der";
    case "feminine":
      return "die";
    case "neuter":
      return "das";
    default:
      return null;
  }
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The narration voices, shared by both halves of the project: the pipeline
 * synthesizes every text with all of them, the app lets the reader pick one.
 *
 * Adding or removing an entry changes the source hash (see pipeline/source.ts),
 * so the next `npm run content` rebuilds the narrations without a
 * PIPELINE_VERSION bump. Reordering does not — the hash is taken over the set.
 * The id is both the Edge voice name and the file name under
 * public/media/texts/<slug>/.
 */

export interface VoiceInfo {
  id: string;
  /** Shown in the picker. */
  name: string;
  /**
   * What this voice says when the reader auditions it. Each one mentions
   * something true about how it reads, since that is the thing being chosen,
   * and each opens differently so four of them in a row do not blur together.
   *
   * Kept to a single sentence: the engine's pause at a full stop is long
   * enough that the clip sounds finished, and then starts talking again.
   */
  sample: string;
}

/** The first entry is what a reader hears before they choose anything. */
export const VOICES: readonly VoiceInfo[] = [
  {
    id: "de-DE-ConradNeural",
    name: "Conrad",
    sample: "Ich bin Conrad und lese Ihnen die Texte ruhig und deutlich vor.",
  },
  {
    id: "de-DE-SeraphinaMultilingualNeural",
    name: "Seraphina",
    sample: "Mein Name ist Seraphina und auch schwierige Wörter spreche ich sauber aus.",
  },
  {
    id: "de-DE-FlorianMultilingualNeural",
    name: "Florian",
    sample: "Hier spricht Florian, mit etwas mehr Tempo als die anderen drei.",
  },
  {
    id: "de-DE-KillianNeural",
    name: "Killian",
    sample: "Bei mir, dem Killian, bekommt jeder einzelne Satz ein wenig mehr Zeit.",
  },
];

export const DEFAULT_VOICE = VOICES[0].id;

export function findVoice(id: string): VoiceInfo | undefined {
  return VOICES.find((voice) => voice.id === id);
}

/** Where the audition clip for a voice lives, relative to the site root. */
export function voiceSampleSrc(id: string): string {
  return `/media/voices/${id}.mp3`;
}

/**
 * Whatever a document holds for this voice — its narration, its length —
 * falling back to any other voice's. Data built before a voice joined the
 * roster still has to play something and still has to show a duration, and
 * both places used to spell that fallback out for themselves.
 */
export function forVoice<T>(byVoice: Record<string, T>, id: string): T | null {
  return byVoice[id] ?? Object.values(byVoice)[0] ?? null;
}

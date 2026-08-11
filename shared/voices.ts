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
   * What this voice says when the reader auditions it. A short greeting is
   * enough — the voice itself is the thing being chosen, and a sentence
   * describing how it reads is over before the ear has settled on it.
   *
   * A second sentence buys the engine's pause at a full stop, and what that
   * costs depends on the voice: measured on these clips the break is 0.52s
   * for Seraphina and 1.14s for Killian, whose silences run as long as
   * Conrad's — long enough that the clip sounds finished and then starts
   * talking again. A comma is worth about 0.22s in either of them.
   */
  sample: string;
}

/** The first entry is what a reader hears before they choose anything. */
export const VOICES: readonly VoiceInfo[] = [
  {
    id: "de-DE-ConradNeural",
    name: "Conrad",
    sample: "Hallo, ich bin Conrad, schön, dass du da bist.",
  },
  {
    id: "de-DE-SeraphinaMultilingualNeural",
    name: "Seraphina",
    sample: "Hi, ich bin Seraphina. Lass uns lesen!",
  },
  {
    id: "de-DE-FlorianMultilingualNeural",
    name: "Florian",
    sample: "Hallo, ich bin Florian, viel Spaß beim Lesen!",
  },
  {
    id: "de-DE-KillianNeural",
    name: "Killian",
    sample: "Guten Tag, ich bin Killian. Lass uns anfangen!",
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

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
   * something true about how it reads, since that is the thing being chosen.
   */
  sample: string;
}

/** The first entry is what a reader hears before they choose anything. */
export const VOICES: readonly VoiceInfo[] = [
  {
    id: "de-DE-ConradNeural",
    name: "Conrad",
    sample: "Guten Tag, ich bin Conrad. Ich lese ruhig und deutlich.",
  },
  {
    id: "de-DE-SeraphinaMultilingualNeural",
    name: "Seraphina",
    sample: "Hallo, ich bin Seraphina. So klingt meine Stimme.",
  },
  {
    id: "de-DE-FlorianMultilingualNeural",
    name: "Florian",
    sample: "Hallo, ich bin Florian. Bei mir geht es zügiger voran.",
  },
  {
    id: "de-DE-KillianNeural",
    name: "Killian",
    sample: "Guten Tag, ich bin Killian. Ich lasse mir Zeit.",
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

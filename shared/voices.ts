/**
 * The narration voices, shared by both halves of the project: the pipeline
 * synthesizes every text with all of them, the app lets the reader pick one.
 *
 * Adding or removing an entry changes the source hash (see pipeline/source.ts),
 * so the next `npm run content` rebuilds the narrations without a
 * PIPELINE_VERSION bump. The id is both the Edge voice name and the file name
 * under public/media/texts/<slug>/.
 */

export interface VoiceInfo {
  id: string;
  /** Shown in the picker. */
  name: string;
  gender: "female" | "male";
}

/** The first entry is what a reader hears before they choose anything. */
export const VOICES: readonly VoiceInfo[] = [
  { id: "de-DE-SeraphinaMultilingualNeural", name: "Seraphina", gender: "female" },
  { id: "de-DE-FlorianMultilingualNeural", name: "Florian", gender: "male" },
  { id: "de-DE-KillianNeural", name: "Killian", gender: "male" },
  { id: "de-DE-ConradNeural", name: "Conrad", gender: "male" },
];

export const DEFAULT_VOICE = VOICES[0].id;

export function findVoice(id: string): VoiceInfo | undefined {
  return VOICES.find((voice) => voice.id === id);
}

import { useEffect } from "react";
import { AudioLines, Volume2 } from "lucide-react";
import { VOICES, voiceSampleSrc } from "../../shared/voices";
import { playClip, prefetchClips } from "../lib/clipAudio";
import { SettingPicker, type PickerOption } from "./SettingPicker";
import styles from "./VoicePicker.module.css";

interface Props {
  voiceId: string;
  onSelect: (id: string) => void;
}

/**
 * Who reads the text. Every voice was synthesized at build time, so switching
 * only swaps which file plays — see useNarration for how the reader's place in
 * the text survives the swap.
 *
 * Each option can be auditioned without being chosen: the clip goes through
 * the same Web Audio path as the word recordings, so the sidebar's volume
 * applies to it and nothing has to be fetched at the moment of the click.
 */
export function VoicePicker({ voiceId, onSelect }: Props) {
  useEffect(() => {
    void prefetchClips(VOICES.map((voice) => voiceSampleSrc(voice.id)));
  }, []);

  const options: PickerOption[] = VOICES.map((voice) => ({
    id: voice.id,
    label: voice.name,
    action: (
      <button
        type="button"
        className={styles.preview}
        // The button sits inside the option; without this, auditioning a voice
        // would also select it.
        onClick={(event) => {
          event.stopPropagation();
          playClip(voiceSampleSrc(voice.id));
        }}
        aria-label={`Hear ${voice.name}`}
        title={`Hear ${voice.name}`}
      >
        <Volume2 size={17} strokeWidth={2} />
      </button>
    ),
  }));

  return (
    <SettingPicker
      label="Voice"
      name="Narration voice"
      leading={<AudioLines size={19} strokeWidth={2} />}
      options={options}
      selectedId={voiceId}
      onSelect={onSelect}
    />
  );
}

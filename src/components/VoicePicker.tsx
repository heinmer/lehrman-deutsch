import { AudioLines } from "lucide-react";
import { VOICES, findVoice } from "../../shared/voices";
import { SettingPicker, type PickerOption } from "./SettingPicker";

interface Props {
  voiceId: string;
  onSelect: (id: string) => void;
}

/**
 * Who reads the text. Every voice was synthesized at build time, so switching
 * only swaps which file plays — see useNarration for how the reader's place in
 * the text survives the swap.
 */
export function VoicePicker({ voiceId, onSelect }: Props) {
  const options: PickerOption[] = VOICES.map((voice) => ({
    id: voice.id,
    label: voice.name,
    meta: voice.gender,
  }));

  return (
    <SettingPicker
      // The pill names the voice rather than the setting: with four of them,
      // which one is speaking is the thing worth showing.
      label={findVoice(voiceId)?.name ?? "Voice"}
      name="Narration voice"
      leading={<AudioLines size={19} strokeWidth={2} />}
      options={options}
      selectedId={voiceId}
      onSelect={onSelect}
      align="end"
    />
  );
}

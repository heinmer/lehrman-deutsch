import { THEMES, type ThemeInfo } from "../lib/themes";
import { SettingPicker, type PickerOption } from "./SettingPicker";
import styles from "./ThemePicker.module.css";

interface Props {
  themeId: string;
  theme: ThemeInfo | undefined;
  onSelect: (id: string) => void;
}

/** Half page ground, half accent — the theme in one dot. */
function disc(entry: ThemeInfo) {
  return (
    <span
      className={styles.disc}
      style={{
        background: `linear-gradient(135deg, ${entry.swatch[0]} 0 50%, ${entry.swatch[1]} 50% 100%)`,
      }}
    />
  );
}

export function ThemePicker({ themeId, theme, onSelect }: Props) {
  const options: PickerOption[] = THEMES.map((entry, index) => ({
    id: entry.id,
    label: entry.name,
    leading: disc(entry),
    // Dark themes and light ones are two groups, not one long list.
    separated: index > 0 && THEMES[index - 1].mode !== entry.mode,
  }));

  return (
    <SettingPicker
      label="Theme"
      name="Theme"
      leading={theme && disc(theme)}
      options={options}
      selectedId={themeId}
      onSelect={onSelect}
    />
  );
}

import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { THEMES, type ThemeInfo } from "../lib/themes";
import styles from "./ThemePicker.module.css";

interface Props {
  themeId: string;
  theme: ThemeInfo | undefined;
  onSelect: (id: string) => void;
}

export function ThemePicker({ themeId, theme, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const light = THEMES.filter((t) => t.mode === "light");
  const dark = THEMES.filter((t) => t.mode === "dark");

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Choose a theme"
      >
        <Palette size={19} strokeWidth={2} />
        {theme?.name ?? "Theme"}
      </button>

      {open && (
        <div className={styles.menu} role="listbox" aria-label="Themes">
          <Group label="Light" themes={light} themeId={themeId} onSelect={onSelect} />
          <Group label="Dark" themes={dark} themeId={themeId} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}

interface GroupProps {
  label: string;
  themes: ThemeInfo[];
  themeId: string;
  onSelect: (id: string) => void;
}

function Group({ label, themes, themeId, onSelect }: GroupProps) {
  return (
    <>
      <p className={styles.groupLabel}>{label}</p>
      {themes.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="option"
          aria-selected={entry.id === themeId}
          className={styles.option}
          onClick={() => onSelect(entry.id)}
        >
          <span
            className={styles.swatch}
            style={{
              background: entry.swatch[0],
              borderColor: entry.swatch[1],
            }}
          >
            <span className={styles.swatchDot} style={{ background: entry.swatch[2] }} />
          </span>
          <span className={styles.optionName}>{entry.name}</span>
          {entry.id === themeId && <Check size={17} strokeWidth={2.5} />}
        </button>
      ))}
    </>
  );
}

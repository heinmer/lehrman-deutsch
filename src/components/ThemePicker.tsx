import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { THEMES, type ThemeInfo } from "../lib/themes";
import styles from "./ThemePicker.module.css";

interface Props {
  themeId: string;
  theme: ThemeInfo | undefined;
  onSelect: (id: string) => void;
}

function discStyle(entry: ThemeInfo) {
  return {
    background: `linear-gradient(135deg, ${entry.swatch[0]} 0 50%, ${entry.swatch[1]} 50% 100%)`,
  };
}

/** A settings pill like the others, opening a list of themes. */
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

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className="control"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {theme && <span className={styles.disc} style={discStyle(theme)} />}
        Theme
        <ChevronDown size={17} strokeWidth={2} className={styles.chevron} data-open={open} />
      </button>

      {open && (
        <div className={styles.menu} role="listbox" aria-label="Theme">
          {THEMES.map((entry, index) => (
            <div key={entry.id}>
              {index > 0 && THEMES[index - 1].mode !== entry.mode && (
                <hr className={styles.divider} />
              )}
              <button
                type="button"
                role="option"
                aria-selected={entry.id === themeId}
                className={styles.option}
                onClick={() => {
                  onSelect(entry.id);
                  setOpen(false);
                }}
              >
                <span className={styles.disc} style={discStyle(entry)} />
                {entry.name}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

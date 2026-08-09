import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./SettingPicker.module.css";

export interface PickerOption {
  id: string;
  label: string;
  /** A swatch, an icon — whatever identifies the option at a glance. */
  leading?: ReactNode;
  /** Muted text set to the right of the label. */
  meta?: string;
  /** Draws a rule above this option, so a list can fall into groups. */
  separated?: boolean;
}

interface Props {
  /** Text on the pill itself. */
  label: string;
  leading?: ReactNode;
  /** Accessible name for the list that opens. */
  name: string;
  options: readonly PickerOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  /**
   * Which edge of the pill the menu lines up with. `end` is for a pill sitting
   * near the sidebar's right edge, where a menu opening rightwards would be
   * clipped — the sidebar hides its overflow.
   */
  align?: "start" | "end";
}

/**
 * A settings pill that opens a list of choices. Shared by the sidebar's
 * pickers: the popover behaviour — click outside, Escape, opening upwards
 * because the sidebar sits at the bottom of the window — is the same for all
 * of them and only the options differ.
 */
export function SettingPicker({
  label,
  leading,
  name,
  options,
  selectedId,
  onSelect,
  align = "start",
}: Props) {
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
        {leading}
        {label}
        <ChevronDown size={17} strokeWidth={2} className={styles.chevron} data-open={open} />
      </button>

      {open && (
        <div className={styles.menu} data-align={align} role="listbox" aria-label={name}>
          {options.map((option) => (
            <div key={option.id}>
              {option.separated && <hr className={styles.divider} />}
              <button
                type="button"
                role="option"
                aria-selected={option.id === selectedId}
                className={styles.option}
                onClick={() => {
                  onSelect(option.id);
                  setOpen(false);
                }}
              >
                {option.leading}
                {option.label}
                {option.meta && <span className={styles.meta}>{option.meta}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

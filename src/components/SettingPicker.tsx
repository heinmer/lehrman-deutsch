import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./SettingPicker.module.css";

/** Distance kept between the menu and the edge of its boundary. */
const EDGE_MARGIN = 8;

export interface PickerOption {
  id: string;
  label: string;
  /** A swatch, an icon — whatever identifies the option at a glance. */
  leading?: ReactNode;
  /**
   * A control at the far end of the row, doing something other than choosing:
   * the voices audition themselves from here. It sits inside the option, so it
   * has to stop the click from also selecting.
   */
  action?: ReactNode;
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
}: Props) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"start" | "end">("start");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * The menu hangs from the pill's left edge and flips to the right one when
   * that would take it outside the boundary — which pill sits where changes
   * whenever the settings are reordered, so it is not worth deciding by hand.
   * Measured before paint, so the menu never appears on the wrong side.
   */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const root = rootRef.current;
    if (!open || !menu || !root) return;

    const boundary = root.closest<HTMLElement>("[data-popover-boundary]");
    const bounds = boundary?.getBoundingClientRect() ?? {
      left: 0,
      right: window.innerWidth,
    };
    const pill = root.getBoundingClientRect();

    const overflowsRight = pill.left + menu.offsetWidth > bounds.right - EDGE_MARGIN;
    const fitsFlipped = pill.right - menu.offsetWidth >= bounds.left + EDGE_MARGIN;
    setAlign(overflowsRight && fitsFlipped ? "end" : "start");
  }, [open]);

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
        <div
          className={styles.menu}
          ref={menuRef}
          data-align={align}
          role="listbox"
          aria-label={name}
        >
          {options.map((option) => {
            const choose = () => {
              onSelect(option.id);
              setOpen(false);
            };

            return (
              <div key={option.id}>
                {option.separated && <hr className={styles.divider} />}
                {/* A div, not a button: an option that carries its own button
                    cannot be one itself. */}
                <div
                  role="option"
                  tabIndex={0}
                  aria-selected={option.id === selectedId}
                  className={styles.option}
                  onClick={choose}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      choose();
                    }
                  }}
                >
                  {option.leading}
                  {option.label}
                  {option.action && <span className={styles.action}>{option.action}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

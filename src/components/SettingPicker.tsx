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
  /** Text on the pill. Leave it out for a round, icon-only control. */
  label?: string;
  leading?: ReactNode;
  /** Accessible name for the list, and for the control when it has no label. */
  name: string;
  options: readonly PickerOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  /**
   * `hover` is for a control tight enough that reaching it is already the
   * request — the player's voice button, like the sidebar's volume slider.
   */
  trigger?: "click" | "hover";
}

/**
 * A settings control that opens a list of choices. Shared by the pickers: the
 * popover behaviour — click outside, Escape, opening upwards because these
 * controls sit at the bottom of the window, staying inside the boundary that
 * clips them — is the same for all of them and only the options differ.
 */
export function SettingPicker({
  label,
  leading,
  name,
  options,
  selectedId,
  onSelect,
  trigger = "click",
}: Props) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"start" | "end">("start");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * The menu hangs from the control's left edge and flips to the right one
   * when that would take it outside the boundary — which control sits where
   * changes whenever the settings are reordered, so it is not worth deciding
   * by hand. Measured before paint, so the menu never appears on the wrong
   * side.
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
    const control = root.getBoundingClientRect();

    const overflowsRight = control.left + menu.offsetWidth > bounds.right - EDGE_MARGIN;
    const fitsFlipped = control.right - menu.offsetWidth >= bounds.left + EDGE_MARGIN;
    setAlign(overflowsRight && fitsFlipped ? "end" : "start");
  }, [open]);

  useEffect(() => {
    if (!open || trigger === "hover") return undefined;

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
  }, [open, trigger]);

  // The menu is a child of the root, so travelling into it never leaves the
  // hover area — and the anchor's padding bridges the gap above the control.
  const hover =
    trigger === "hover"
      ? {
          onPointerEnter: () => setOpen(true),
          onPointerLeave: () => setOpen(false),
        }
      : {};

  return (
    <div className={styles.root} ref={rootRef} {...hover}>
      <button
        type="button"
        className={`control ${label ? "" : styles.iconOnly}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label ? undefined : name}
        title={label ? undefined : name}
      >
        {leading}
        {label}
        {label && (
          <ChevronDown size={17} strokeWidth={2} className={styles.chevron} data-open={open} />
        )}
      </button>

      {open && (
        <div className={styles.anchor} data-align={align}>
          <div className={styles.menu} ref={menuRef} role="listbox" aria-label={name}>
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
        </div>
      )}
    </div>
  );
}

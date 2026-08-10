import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import styles from "./SettingPicker.module.css";

/** Distance kept between the menu and the edge of its boundary. */
const EDGE_MARGIN = 8;

interface Placement {
  align: "start" | "end";
  /** How far the menu is pushed sideways past the control, out to its boundary. */
  shift: number;
  /** How far it is lifted past the control, clear of the boundary's top edge. */
  lift: number;
}

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
  /**
   * Which edges the menu is placed against: the control's own, or those of the
   * box it opens inside — the bar, the sidebar. A control sits inset from its
   * host's edges by that host's padding, so a menu hung off the control stops
   * short of the side and comes to rest *on* the top edge rather than above
   * it. The player's voice menu takes the second, being the last thing in a
   * bar it should clear.
   */
  edge?: "control" | "boundary";
  /**
   * `large` is for a menu that opens over the page rather than inside the
   * settings footer — the voice list, read from across the reader and carrying
   * a button in every row. The footer's own menus stay the size of the footer.
   */
  size?: "regular" | "large";
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
  edge = "control",
  size = "regular",
}: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ align: "start", shift: 0, lift: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * The menu hangs from the control's left edge and flips to the right one
   * when that would take it outside the boundary — which control sits where
   * changes whenever the settings are reordered, so it is not worth deciding
   * by hand. Measured before paint, so the menu never appears on the wrong
   * side. The distance out to the boundary's own edge is measured here for the
   * same reason: the padding holding the control off it belongs to the host.
   */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const root = rootRef.current;
    if (!open || !menu || !root) return;

    const boundary = root.closest<HTMLElement>("[data-popover-boundary]");
    const bounds = boundary?.getBoundingClientRect() ?? {
      left: 0,
      right: window.innerWidth,
      top: 0,
    };
    const control = root.getBoundingClientRect();

    const overflowsRight = control.left + menu.offsetWidth > bounds.right - EDGE_MARGIN;
    const fitsFlipped = control.right - menu.offsetWidth >= bounds.left + EDGE_MARGIN;
    const align = overflowsRight && fitsFlipped ? "end" : "start";

    setPlacement({
      align,
      shift:
        edge === "control"
          ? 0
          : align === "end"
            ? bounds.right - control.right
            : control.left - bounds.left,
      // Cleared over the whole box, so a bar that has wrapped to two rows is
      // not something the menu comes down on top of.
      lift: edge === "control" ? 0 : Math.max(0, control.top - bounds.top),
    });
  }, [open, edge]);

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

  // A list of options answers to the arrow keys, or it is a list only to the
  // eye. Home and End go to the ends; Escape is handled above.
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0 && event.key !== "Home" && event.key !== "End") return;

    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    if (items.length === 0) return;

    const here = items.indexOf(document.activeElement as HTMLElement);
    const target =
      event.key === "Home"
        ? items[0]
        : event.key === "End"
          ? items[items.length - 1]
          : // Wraps, so the end of a short list is never a dead end.
            items[(here + step + items.length) % items.length];

    event.preventDefault();
    target.focus();
  };

  // Opened from the keyboard, the menu should be where the keyboard is. Not in
  // hover mode: there the pointer arriving would steal focus from elsewhere.
  useEffect(() => {
    if (!open || trigger === "hover") return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    const chosen = [...(items ?? [])].find((item) => item.ariaSelected === "true");
    (chosen ?? items?.[0])?.focus();
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
        <div
          className={styles.anchor}
          data-align={placement.align}
          style={
            {
              "--popover-shift": `${placement.shift}px`,
              "--popover-lift": `${placement.lift}px`,
            } as CSSProperties
          }
        >
          <div
            className={styles.menu}
            ref={menuRef}
            data-size={size}
            role="listbox"
            aria-label={name}
            onKeyDown={onMenuKeyDown}
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
        </div>
      )}
    </div>
  );
}

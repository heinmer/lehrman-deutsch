import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { X } from "lucide-react";
import styles from "./HelpDialog.module.css";

interface Props {
  /** Escape is handled by the app, which knows what else is open. */
  onClose: () => void;
}

/**
 * Ctrl+click is the context menu on a Mac, so the shortcut there is Cmd — and
 * the window has to say so with the key the reader actually has.
 */
const APPLE = /Mac|iP(hone|ad|od)/.test(navigator.userAgent);
const PRIMARY_KEY = APPLE ? "⌘" : "Ctrl";
const OPTION_KEY = APPLE ? "⌥" : "Alt";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The extra reading the interface has no room for, in front of everything
 * else. Today that is the two word shortcuts; it is the place anything of the
 * same kind belongs.
 */
export function HelpDialog({ onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus goes into the dialog and comes back to whatever opened it, so the
  // keyboard is where the eye is and does not restart from the top of the page.
  useEffect(() => {
    const opener = document.activeElement;
    cardRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Tab must not leave a modal: it wraps at both ends. Written against whatever
  // is focusable rather than against the close button, so growing the content
  // cannot quietly open a way out.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !cardRef.current) return;

    const stops = [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (stops.length === 0) return;

    const first = stops[0];
    const last = stops[stops.length - 1];
    const here = document.activeElement;

    if (event.shiftKey && (here === first || here === cardRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && here === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Only a click on the ground itself, not one that started inside the card and
  // ended on it — dragging a selection out of the window must not close it.
  const onGroundClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className={styles.host} role="presentation" onClick={onGroundClick}>
      <div
        ref={cardRef}
        className={`island ${styles.card}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className={styles.top}>
          <h2 id="help-title" className={styles.title}>
            Reading a text
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={22} strokeWidth={2.25} />
          </button>
        </div>

        <div className={styles.body}>
          <h3 className={styles.section}>Clicking a word</h3>

          <dl className={styles.shortcuts}>
            <div className={styles.row}>
              <dt className={styles.keys}>
                <kbd>{PRIMARY_KEY}</kbd>
                <span className={styles.plus}>+</span>
                <span>click</span>
              </dt>
              <dd className={styles.what}>
                Reads the text from that word. Playback starts even from a
                standstill, and the word itself is neither opened nor spoken.
              </dd>
            </div>

            <div className={styles.row}>
              <dt className={styles.keys}>
                <kbd>{OPTION_KEY}</kbd>
                <span className={styles.plus}>+</span>
                <span>click</span>
              </dt>
              {/* Not "on the right": below 48rem the panel is a drawer. */}
              <dd className={styles.what}>
                Opens the word and nothing else — the playhead stays where it
                is and no recording is played.
              </dd>
            </div>

            <div className={styles.row}>
              <dt className={styles.keys}>
                <span>click</span>
              </dt>
              <dd className={styles.what}>
                Opens the word, and then whatever <b>Say word</b> and{" "}
                <b>Jump</b> are set to below.
              </dd>
            </div>
          </dl>

          <p className={styles.note}>
            Both shortcuts ignore those two settings, so either behaviour is
            always one click away. They work from the keyboard too:
            hold the key and press <kbd>Enter</kbd> on the focused word.
          </p>
        </div>
      </div>
    </div>
  );
}

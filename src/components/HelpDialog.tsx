import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { LocateFixed, MessageCircle, X } from "lucide-react";
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
 * Whatever the interface has no room to say, in front of everything else.
 * Today that is two tables under headings of their own — the window is titled
 * for the site rather than for its contents, so that the next thing to go in
 * it is a third section and not a second window. The settings come first
 * because they are what a plain click does; the shortcuts read as the
 * exceptions to them, which is what the note under that heading says.
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
            About
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={24} strokeWidth={2.25} />
          </button>
        </div>

        <div className={styles.body}>
          <h3 className={styles.section}>Settings</h3>
          <p className={styles.note}>
            Two of the sidebar's toggles, for what a plain click on a word does.
            It always opens the word.
          </p>

          <dl className={styles.rows}>
            <div className={styles.row}>
              {/* The sidebar's own icons, so a row can be found by its shape
                  rather than by reading the footer for its label. */}
              <dt className={styles.setting}>
                <MessageCircle size={17} strokeWidth={2} />
                Say word
              </dt>
              <dd className={styles.what}>
                Speaks the word in a native speaker's voice. Held back while the
                narration runs, so the two never overlap.
              </dd>
            </div>

            <div className={styles.row}>
              <dt className={styles.setting}>
                <LocateFixed size={17} strokeWidth={2} />
                Jump
              </dt>
              <dd className={styles.what}>
                Moves the narration to that word, without starting or stopping
                it.
              </dd>
            </div>
          </dl>

          <h3 className={styles.section}>Shortcuts</h3>
          <p className={styles.note}>
            Each names a whole behaviour, whatever the settings above say.
          </p>

          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt className={styles.keys}>
                <kbd>Space</kbd>
              </dt>
              <dd className={styles.what}>
                Plays and pauses the narration, wherever you are on the page.
              </dd>
            </div>

            <div className={styles.row}>
              <dt className={styles.keys}>
                <kbd>{PRIMARY_KEY}</kbd>
                <span className={styles.plus}>+</span>
                <span>click</span>
              </dt>
              {/* Not "on the right": below 48rem the panel is a drawer. */}
              <dd className={styles.what}>
                Opens the word only. Nothing is spoken and nothing moves.
              </dd>
            </div>

            <div className={styles.row}>
              <dt className={styles.keys}>
                <kbd>{OPTION_KEY}</kbd>
                <span className={styles.plus}>+</span>
                <span>click</span>
              </dt>
              <dd className={styles.what}>
                Speaks the word only, over the narration if it is running.
              </dd>
            </div>

            <div className={styles.row}>
              <dt className={styles.keys}>
                <kbd>{PRIMARY_KEY}</kbd>
                <span className={styles.plus}>+</span>
                <kbd>{OPTION_KEY}</kbd>
                <span className={styles.plus}>+</span>
                <span>click</span>
              </dt>
              <dd className={styles.what}>
                Reads the text from that word, starting playback if it is
                paused.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

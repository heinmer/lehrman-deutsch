import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { LocateFixed, MessageCircle, X } from "lucide-react";
import { recordists, useCredits } from "../hooks/useCredits";
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
/**
 * Ctrl+Space is Ctrl on a Mac too — Cmd+Space is Spotlight — so this is the
 * one row that names the Control key itself rather than the primary modifier.
 */
const CONTROL_KEY = APPLE ? "⌃" : "Ctrl";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Whatever the interface has no room to say, in front of everything else.
 * Today that is three sections of one shape — a heading, a note under it, and
 * a table where there is one to show. The window is titled for the site rather
 * than for its contents, so that the next thing to go in it is a fourth
 * section and not a second window.
 *
 * What the site is comes first, because a reader who has just landed does not
 * yet know what the toggles below are toggling. It is a heading and a note and
 * nothing else, which is a section short of a table rather than a thing of its
 * own kind: set larger and darker as an opening it stopped reading as one of
 * the three. Then the settings, because they are what a plain click does, and
 * the shortcuts, which read as the exceptions to them.
 */
export function HelpDialog({ onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Only while the window is open, which is the only place the list is read.
  const names = recordists(useCredits(true));

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
          {/* Each section is its own box so that the line between them can be
              drawn by the box and reach the card's edges — a division of a
              different order from the hairlines inside a table, which stop at
              the text. */}
          <section className={styles.block}>
            <h3 className={styles.section}>What is Lehrman-Deutsch?</h3>
            {/* What it is, then the one move the whole thing turns on. The
                heading has just named the site, so the sentence says "This is"
                rather than naming it twice. It stays a note like the two below
                it: a paragraph that has to be read before the tables are
                reached is no longer one. */}
            <p className={styles.note}>
              This is a reader for learning German: short texts, read aloud from
              beginning to end, with the word being spoken lit as it goes. Click
              any word for its pronunciation, its part of speech and what it
              means in English, and to hear a native speaker say it.
            </p>
          </section>

          <section className={styles.block}>
            <h3 className={styles.section}>Settings</h3>
            <p className={styles.note}>
              Two of the sidebar's toggles, for what a plain click on a word
              does. It always opens the word.
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
                  Speaks the word in a native speaker's voice. Held back while
                  the narration runs, so the two never overlap.
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
          </section>

          <section className={styles.block}>
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
                  <kbd>{CONTROL_KEY}</kbd>
                  <span className={styles.plus}>+</span>
                  <kbd>Space</kbd>
                </dt>
                <dd className={styles.what}>
                  Reads the text from the beginning, starting playback if it is
                  paused.
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
          </section>

          {/* Last, because it is about where the material came from rather than
              about using the site — and it is the one section a reader arrives
              at deliberately. Same shape as the three above it. */}
          <section className={styles.block}>
            <h3 className={styles.section}>Sources</h3>
            <p className={styles.note}>
              The words, their meanings and their recordings are the work of
              Wiktionary and Wikimedia Commons volunteers. The texts, the
              pictures and the narration are made for this site.
            </p>

            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt className={styles.source}>Dictionary</dt>
                <dd className={styles.what}>
                  Meanings, transcriptions and parts of speech from{" "}
                  <a
                    href="https://en.wiktionary.org/wiki/Wiktionary:Main_Page"
                    target="_blank"
                    rel="noreferrer"
                  >
                    English Wiktionary
                  </a>
                  , by way of the Wiktextract dumps at{" "}
                  <a href="https://kaikki.org/" target="_blank" rel="noreferrer">
                    kaikki.org
                  </a>
                  , with German Wiktionary for transcriptions the English
                  edition does not carry. Used and adapted under{" "}
                  <a
                    href="https://creativecommons.org/licenses/by-sa/4.0/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CC BY-SA 4.0
                  </a>
                  . Every word links to its own entry.
                </dd>
              </div>

              <div className={styles.row}>
                <dt className={styles.source}>Recordings</dt>
                {/* The names are read off the data rather than written here, so
                    a text that brings in a new voice credits them without
                    anybody remembering to. Until the file arrives — or if it
                    never does — the row still says who to look for and where,
                    which is what the licence asks of it. */}
                <dd className={styles.what}>
                  Spoken by{" "}
                  {names.length > 0 ? (
                    <span className={styles.names}>{names.join(", ")}</span>
                  ) : (
                    "contributors"
                  )}{" "}
                  and shared on{" "}
                  <a
                    href="https://commons.wikimedia.org/wiki/Category:German_pronunciation"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Wikimedia Commons
                  </a>
                  . Each recording carries its own licence — CC BY-SA, CC BY or
                  CC0 — named beside the word and linked to its file page.
                </dd>
              </div>

              {/* Both of these ask for the copyright notice and not only for
                  the licence's name, so the holders are printed rather than
                  left on the file the reader would have to go and find. */}
              <div className={styles.row}>
                <dt className={styles.source}>Type</dt>
                <dd className={styles.what}>
                  DM Sans, © The DM Sans Project Authors, and PT Serif, ©
                  ParaType Ltd, under the{" "}
                  <a href="https://openfontlicense.org/" target="_blank" rel="noreferrer">
                    SIL Open Font License 1.1
                  </a>
                  .
                </dd>
              </div>

              <div className={styles.row}>
                <dt className={styles.source}>Icons</dt>
                <dd className={styles.what}>
                  <a href="https://lucide.dev/" target="_blank" rel="noreferrer">
                    Lucide
                  </a>
                  , © Lucide Icons and Contributors, under the ISC License.
                </dd>
              </div>

              {/* Last, and the only row that is about this site rather than
                  about something it borrowed. The AGPL asks that a version put
                  on a network offer its source to the people using it; here it
                  is offered whether or not anyone is obliged to. */}
              <div className={styles.row}>
                <dt className={styles.source}>This site</dt>
                <dd className={styles.what}>
                  The code is{" "}
                  <a
                    href="https://github.com/heinmer/lehrman-deutsch"
                    target="_blank"
                    rel="noreferrer"
                  >
                    on GitHub
                  </a>
                  , under the GNU AGPL v3. The texts, the illustrations, the
                  mark and the name are not part of that — they are © 2026
                  heinmer.
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CloudOff, Languages, Loader2, RotateCw } from "lucide-react";
import type { Sentence, TextDocument, Token, WordToken } from "../../shared/types";
import { useDelayedFlag } from "../hooks/useDelayedFlag";
import { assetUrl } from "../lib/assets";
import { wordAction, type WordAction } from "../lib/wordAction";
import { LevelBadge } from "./LevelBadge";
import styles from "./Reader.module.css";

interface Props {
  /**
   * Not named `document`: as a prop it shadowed the global one throughout the
   * component, and this file does reach for real DOM APIs.
   */
  text: TextDocument | null;
  /**
   * Header illustration for this text, as the index gives it — site-root
   * relative, null when the text has none or the reader has turned pictures
   * off. Decorative: it repeats the scene the text describes and is hidden
   * from screen readers.
   */
  image: string | null;
  /** Set when this text failed to load; the rest of the app keeps working. */
  failedSlug: string | null;
  onRetry: () => void;
  activeWordId: string | null;
  activeSentenceId: string | null;
  selectedWordId: string | null;
  /**
   * The action is read off the modifiers held at the time (see `wordAction`);
   * this component only reports which one was asked for.
   */
  onSelectWord: (token: WordToken, action: WordAction) => void;
  /**
   * The pointer or the focus reaching a word, which is taken as "this one may
   * be clicked next" — early enough for its recording to be there when it is.
   */
  onWarmWord: (token: WordToken) => void;
  /**
   * The player, which rides at the end of this section's flow and sticks to
   * the bottom of it. It belongs to the scroll box rather than beside it so
   * that it is the width of the text: a scrollbar that takes layout space
   * narrows the column, and nothing else could tell the bar by how much. It is
   * rendered in every state, including the ones with no text to read.
   */
  children?: ReactNode;
}

interface SentenceProps {
  sentence: Sentence;
  activeWordId: string | null;
  activeSentenceId: string | null;
  selectedWordId: string | null;
  onSelectWord: (token: WordToken, action: WordAction) => void;
  onWarmWord: (token: WordToken) => void;
  /** The word currently in the tab order — see the roving tabindex below. */
  tabbableId: string | null;
  onFocusWord: (token: WordToken) => void;
  onWordKeyDown: (event: KeyboardEvent<HTMLElement>, token: WordToken) => void;
  /** False for the last sentence, so nothing can break before what follows. */
  trailingSpace?: boolean;
  /**
   * Put on the same unbreakable line as the last word. Chromium allows a break
   * in front of an atomic inline box whether or not a space precedes it, so a
   * translate toggle placed after the sentence would otherwise end up alone on
   * a line of its own.
   */
  trailing?: ReactNode;
}

/** Shared so that resetting to "nothing open" is not a new object each time. */
const NONE_OPEN: ReadonlySet<string> = new Set();

/** One sentence, every word clickable — used for the title and body alike. */
function SentenceView({
  sentence,
  activeWordId,
  activeSentenceId,
  selectedWordId,
  onSelectWord,
  onWarmWord,
  tabbableId,
  onFocusWord,
  onWordKeyDown,
  trailingSpace = true,
  trailing,
}: SentenceProps) {
  const renderToken = (token: Token, index: number) =>
    token.kind === "word" ? (
      // A span, not a button: Chrome lays buttons out as atomic inline
      // boxes, which lets a line break fall between a word and the
      // punctuation that follows it.
      <span
        key={token.id}
        role="button"
        // One word at a time is in the tab order; the arrow keys walk the
        // rest. Every word being a tab stop meant a 250-word text was 250
        // presses deep before the keyboard reached the player.
        tabIndex={token.id === tabbableId ? 0 : -1}
        data-word
        className={styles.word}
        data-active={token.id === activeWordId}
        data-selected={token.id === selectedWordId}
        onClick={(event) => onSelectWord(token, wordAction(event))}
        onPointerEnter={() => onWarmWord(token)}
        onFocus={() => {
          onWarmWord(token);
          onFocusWord(token);
        }}
        onKeyDown={(event) => onWordKeyDown(event, token)}
      >
        {token.text}
      </span>
    ) : (
      <span key={`${sentence.id}p${index}`}>{token.text}</span>
    );

  // Everything from the last word onwards — the word, the full stop after it
  // and whatever is trailing — travels as one unbreakable piece.
  const lastWord = sentence.tokens.reduce(
    (found, token, index) => (token.kind === "word" ? index : found),
    -1,
  );
  const head = lastWord < 0 ? sentence.tokens : sentence.tokens.slice(0, lastWord);
  const tail = lastWord < 0 ? [] : sentence.tokens.slice(lastWord);

  return (
    <span
      data-sentence={sentence.id}
      className={styles.sentence}
      data-active={sentence.id === activeSentenceId}
    >
      {head.map(renderToken)}
      <span className={styles.tail}>
        {tail.map((token, index) => renderToken(token, lastWord + index))}
        {trailing}
      </span>
      {/* Sentence segmentation trims the space that separated them. */}
      {trailingSpace && " "}
    </span>
  );
}

export function Reader({
  text,
  image,
  failedSlug,
  onRetry,
  activeWordId,
  activeSentenceId,
  selectedWordId,
  onSelectWord,
  onWarmWord,
  children,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openTranslations, setOpenTranslations] = useState<ReadonlySet<string>>(NONE_OPEN);
  const [titleOpen, setTitleOpen] = useState(false);

  // A new text starts with everything in German again. Adjusted while
  // rendering rather than in an effect, so the first frame of the new text is
  // already closed up instead of briefly showing the last one's translations.
  const [shownSlug, setShownSlug] = useState(text?.slug);
  const [focusedWordId, setFocusedWordId] = useState<string | null>(null);
  if (text?.slug !== shownSlug) {
    setShownSlug(text?.slug);
    setOpenTranslations(NONE_OPEN);
    setTitleOpen(false);
    setFocusedWordId(null);
  }

  // The word the tab key lands on: wherever the reader last was, or the very
  // first word of the text.
  const firstWordId =
    text?.heading.tokens.find((token) => token.kind === "word")?.id ?? null;
  const tabbableId = focusedWordId ?? firstWordId;

  const onFocusWord = useCallback((token: WordToken) => setFocusedWordId(token.id), []);

  // The spinner is held back until the wait is long enough to be worth
  // explaining. A text is a single small JSON file, so switching normally
  // finishes in a few milliseconds and nothing is drawn at all. Once it is up
  // it outstays the load by a little, which is why the *loading state* is held
  // open below and not merely the icon: a text arriving 20ms after the spinner
  // would otherwise take it away again, which is the flash being avoided.
  const showSpinner = useDelayedFlag(!text && !failedSlug);

  /**
   * Arrow keys walk the text; Enter chooses the word under focus, carrying the
   * same modifiers a click would, so the two shortcuts are not something only
   * a mouse can reach.
   *
   * Enter and not Space, though a `role="button"` would normally answer to
   * both: Space is the player's everywhere in the page, and a word giving it
   * up is what buys a transport key that works wherever the focus happens to
   * be — which, after a click on a word, is the word.
   */
  const onWordKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, token: WordToken) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSelectWord(token, wordAction(event));
        return;
      }

      const step =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (step === 0 && event.key !== "Home" && event.key !== "End") return;

      const words = [...(scrollRef.current?.querySelectorAll<HTMLElement>("[data-word]") ?? [])];
      const here = words.indexOf(event.currentTarget);
      const target =
        event.key === "Home"
          ? words[0]
          : event.key === "End"
            ? words[words.length - 1]
            : words[here + step];

      if (target) {
        event.preventDefault();
        target.focus();
      }
    },
    [onSelectWord],
  );

  const toggleTranslation = (paragraphId: string) => {
    setOpenTranslations((open) => {
      const next = new Set(open);
      if (!next.delete(paragraphId)) next.add(paragraphId);
      return next;
    });
  };

  // Follow the narration, but only when the spoken sentence has drifted out of
  // view — scrolling on every sentence would fidget under the reader's eyes.
  useEffect(() => {
    if (!activeSentenceId || !scrollRef.current) return;

    const element = scrollRef.current.querySelector<HTMLElement>(
      `[data-sentence="${activeSentenceId}"]`,
    );
    if (!element) return;

    const container = scrollRef.current.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    const margin = container.height * 0.2;

    if (target.top < container.top + margin || target.bottom > container.bottom - margin) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSentenceId]);

  if (!text || showSpinner) {
    return (
      <div className={`island ${styles.reader}`} ref={scrollRef}>
        {failedSlug ? (
          // In the reader's place, not the whole window's: the text list, the
          // settings and any narration already playing are all still good.
          <div className={styles.failed} role="alert">
            <CloudOff size={52} strokeWidth={1.4} />
            <p className={styles.failedTitle}>This text would not load.</p>
            <p className={styles.failedDetail}>
              <code>{failedSlug}</code> could not be fetched. Pick another text
              from the list, or try this one again.
            </p>
            <button type="button" className={styles.retry} onClick={onRetry}>
              <RotateCw size={19} strokeWidth={2} />
              Try again
            </button>
          </div>
        ) : (
          // The box stays whether or not there is a spinner in it: it is what
          // fills the section above the player, and a wait too short to be
          // worth a spinner is not a reason for the bar to jump. It is also
          // the right shape for a live region — present before it has
          // anything to say, so the spinner arriving is an announcement.
          <div
            className={styles.loading}
            role="status"
            aria-label={showSpinner ? "Loading text" : undefined}
          >
            {showSpinner && <Loader2 size={96} strokeWidth={1.6} className={styles.spinner} />}
          </div>
        )}
        {children}
      </div>
    );
  }

  const shared = {
    activeWordId,
    activeSentenceId,
    selectedWordId,
    onSelectWord,
    onWarmWord,
    tabbableId,
    onFocusWord,
    onWordKeyDown,
  };

  return (
    <div className={`island ${styles.reader}`} ref={scrollRef}>
      {/* The page is in English; this one element is not. A screen reader
          switches voice on it, and the browser hyphenates it by German rules. */}
      <article className={styles.article} lang="de">
        {image && <img className={styles.cover} src={assetUrl(image)} alt="" />}

        <header className={styles.header}>
          <LevelBadge level={text.level} />
          <div>
            <h2 className={styles.title}>
              <SentenceView
                sentence={text.heading}
                trailingSpace={false}
                trailing={
                  text.titleTranslation && (
                    <button
                      type="button"
                      className={styles.translateToggle}
                      onClick={() => setTitleOpen((value) => !value)}
                      aria-expanded={titleOpen}
                      aria-label={titleOpen ? "Hide translation" : "Show translation"}
                      title={titleOpen ? "Hide translation" : "Show translation"}
                    >
                      <Languages size={19} strokeWidth={2} />
                    </button>
                  )
                }
                {...shared}
              />
            </h2>
            {titleOpen && text.titleTranslation && (
              <p className={styles.titleTranslation} lang="en">
                {text.titleTranslation}
              </p>
            )}
          </div>
        </header>

        {text.paragraphs.map((paragraph) => {
          const open = openTranslations.has(paragraph.id);
          return (
            <div key={paragraph.id} className={styles.block}>
              <p className={styles.paragraph}>
                {paragraph.sentences.map((sentence, index) => {
                  const last = index === paragraph.sentences.length - 1;
                  return (
                    <SentenceView
                      key={sentence.id}
                      sentence={sentence}
                      trailingSpace={!last}
                      trailing={
                        last &&
                        paragraph.translation && (
                          <button
                            type="button"
                            className={styles.translateToggle}
                            onClick={() => toggleTranslation(paragraph.id)}
                            aria-expanded={open}
                            aria-label={open ? "Hide translation" : "Show translation"}
                            title={open ? "Hide translation" : "Show translation"}
                          >
                            <Languages size={19} strokeWidth={2} />
                          </button>
                        )
                      }
                      {...shared}
                    />
                  );
                })}
              </p>

              {open && paragraph.translation && (
                <p className={styles.translation} lang="en">
                  {paragraph.translation}
                </p>
              )}
            </div>
          );
        })}
      </article>
      {children}
    </div>
  );
}

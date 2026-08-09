import { useEffect, useRef, useState, type ReactNode } from "react";
import { CloudOff, Languages, Loader2, RotateCw } from "lucide-react";
import type { Sentence, TextDocument, Token, WordToken } from "../../shared/types";
import { LevelBadge } from "./LevelBadge";
import styles from "./Reader.module.css";

interface Props {
  document: TextDocument | null;
  /** Set when this text failed to load; the rest of the app keeps working. */
  failedSlug: string | null;
  onRetry: () => void;
  activeWordId: string | null;
  activeSentenceId: string | null;
  selectedWordId: string | null;
  onSelectWord: (token: WordToken) => void;
}

interface SentenceProps {
  sentence: Sentence;
  activeWordId: string | null;
  activeSentenceId: string | null;
  selectedWordId: string | null;
  onSelectWord: (token: WordToken) => void;
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
        tabIndex={0}
        className={styles.word}
        data-active={token.id === activeWordId}
        data-selected={token.id === selectedWordId}
        onClick={() => onSelectWord(token)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectWord(token);
          }
        }}
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
  document,
  failedSlug,
  onRetry,
  activeWordId,
  activeSentenceId,
  selectedWordId,
  onSelectWord,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openTranslations, setOpenTranslations] = useState<ReadonlySet<string>>(NONE_OPEN);
  const [titleOpen, setTitleOpen] = useState(false);

  // A new text starts with everything in German again. Adjusted while
  // rendering rather than in an effect, so the first frame of the new text is
  // already closed up instead of briefly showing the last one's translations.
  const [shownSlug, setShownSlug] = useState(document?.slug);
  if (document?.slug !== shownSlug) {
    setShownSlug(document?.slug);
    setOpenTranslations(NONE_OPEN);
    setTitleOpen(false);
  }

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

  if (!document) {
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
              <RotateCw size={17} strokeWidth={2} />
              Try again
            </button>
          </div>
        ) : (
          <div className={styles.loading} role="status" aria-label="Loading text">
            <Loader2 size={96} strokeWidth={1.6} className={styles.spinner} />
          </div>
        )}
      </div>
    );
  }

  const shared = { activeWordId, activeSentenceId, selectedWordId, onSelectWord };

  return (
    <div className={`island ${styles.reader}`} ref={scrollRef}>
      <article className={styles.article}>
        <header className={styles.header}>
          <LevelBadge level={document.level} />
          <div>
            <h2 className={styles.title}>
              <SentenceView
                sentence={document.heading}
                trailingSpace={false}
                trailing={
                  document.titleTranslation && (
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
            {titleOpen && document.titleTranslation && (
              <p className={styles.titleTranslation}>{document.titleTranslation}</p>
            )}
          </div>
        </header>

        {document.paragraphs.map((paragraph) => {
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
                <p className={styles.translation}>{paragraph.translation}</p>
              )}
            </div>
          );
        })}
      </article>
    </div>
  );
}

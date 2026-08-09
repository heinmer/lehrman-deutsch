import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import type { Sentence, TextDocument, WordToken } from "../../shared/types";
import { LevelBadge } from "./LevelBadge";
import styles from "./Reader.module.css";

interface Props {
  document: TextDocument | null;
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
}

/** One sentence, every word clickable — used for the title and body alike. */
function SentenceView({
  sentence,
  activeWordId,
  activeSentenceId,
  selectedWordId,
  onSelectWord,
}: SentenceProps) {
  return (
    <span
      data-sentence={sentence.id}
      className={styles.sentence}
      data-active={sentence.id === activeSentenceId}
    >
      {sentence.tokens.map((token, index) =>
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
        ),
      )}
      {/* Sentence segmentation trims the space that separated them. */}{" "}
    </span>
  );
}

export function Reader({
  document,
  activeWordId,
  activeSentenceId,
  selectedWordId,
  onSelectWord,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openTranslations, setOpenTranslations] = useState<ReadonlySet<string>>(new Set());

  const toggleTranslation = (paragraphId: string) => {
    setOpenTranslations((open) => {
      const next = new Set(open);
      if (!next.delete(paragraphId)) next.add(paragraphId);
      return next;
    });
  };

  // A new text starts with everything in German again.
  useEffect(() => setOpenTranslations(new Set()), [document?.slug]);

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
    return <div className={`island ${styles.reader}`} ref={scrollRef} />;
  }

  const shared = { activeWordId, activeSentenceId, selectedWordId, onSelectWord };

  return (
    <div className={`island ${styles.reader}`} ref={scrollRef}>
      <article className={styles.article}>
        <header className={styles.header}>
          <LevelBadge level={document.level} />
          <div>
            <h2 className={styles.title}>
              <SentenceView sentence={document.heading} {...shared} />
            </h2>
            {document.titleTranslation && (
              <p className={styles.titleTranslation}>{document.titleTranslation}</p>
            )}
            {document.topic && <p className={styles.meta}>{document.topic}</p>}
          </div>
        </header>

        {document.paragraphs.map((paragraph) => {
          const open = openTranslations.has(paragraph.id);
          return (
            <div key={paragraph.id} className={styles.block}>
              <p className={styles.paragraph}>
                {paragraph.sentences.map((sentence) => (
                  <SentenceView key={sentence.id} sentence={sentence} {...shared} />
                ))}
                {paragraph.translation && (
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
                )}
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

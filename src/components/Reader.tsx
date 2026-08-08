import { useEffect, useRef } from "react";
import type { TextDocument, WordToken } from "../../shared/types";
import styles from "./Reader.module.css";

interface Props {
  document: TextDocument | null;
  activeWordId: string | null;
  activeSentenceId: string | null;
  selectedWordId: string | null;
  onSelectWord: (token: WordToken) => void;
}

export function Reader({
  document,
  activeWordId,
  activeSentenceId,
  selectedWordId,
  onSelectWord,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
    return <div className={styles.reader} ref={scrollRef} />;
  }

  return (
    <div className={styles.reader} ref={scrollRef}>
      <article className={styles.article}>
        <header className={styles.header}>
          <h2 className={styles.title}>{document.title}</h2>
          <p className={styles.meta}>
            <span className={styles.level}>{document.level}</span>
            {document.topic && <span>{document.topic}</span>}
          </p>
        </header>

        {document.paragraphs.map((paragraph) => (
          <p key={paragraph.id} className={styles.paragraph}>
            {paragraph.sentences.map((sentence) => (
              <span
                key={sentence.id}
                data-sentence={sentence.id}
                className={styles.sentence}
                data-active={sentence.id === activeSentenceId}
              >
                {sentence.tokens.map((token, index) =>
                  token.kind === "word" ? (
                    <button
                      key={token.id}
                      type="button"
                      className={styles.word}
                      data-active={token.id === activeWordId}
                      data-selected={token.id === selectedWordId}
                      onClick={() => onSelectWord(token)}
                    >
                      {token.text}
                    </button>
                  ) : (
                    <span key={`${sentence.id}p${index}`}>{token.text}</span>
                  ),
                )}{" "}
              </span>
            ))}
          </p>
        ))}
      </article>
    </div>
  );
}

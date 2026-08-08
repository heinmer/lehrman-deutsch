import { useCallback, useRef } from "react";
import type { DictionaryEntry, LexemeInfo, WordToken } from "../../shared/types";
import { genderArticle, posLabel } from "../lib/format";
import styles from "./WordPanel.module.css";

interface Props {
  token: WordToken;
  entry: DictionaryEntry | null;
  onClose: () => void;
  /** Restarts the narration at this word; null when it has no timing. */
  onPlayFromWord: (() => void) | null;
}

export function WordPanel({ token, entry, onClose, onPlayFromWord }: Props) {
  const clipRef = useRef<HTMLAudioElement | null>(null);

  const playClip = useCallback((src: string) => {
    clipRef.current?.pause();
    const clip = new Audio(src);
    clipRef.current = clip;
    void clip.play();
  }, []);

  // An inflected form usually has no recording of its own; the lemma's is the
  // next best thing, and it is labelled as such.
  const spoken = entry?.form?.audio ? entry.form : entry?.lemma?.audio ? entry.lemma : null;
  const clip = spoken?.audio ?? null;
  // Inflected forms carry no meaning of their own — the lemma holds it.
  const senseSource = entry?.form?.groups.length ? entry.form : entry?.lemma ?? null;

  return (
    <aside className={styles.panel} aria-label="Word details">
      <div className={styles.top}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3.5 3.5l9 9M12.5 3.5l-9 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.headword}>
          <h3 className={styles.word}>{token.text}</h3>
          {clip && spoken && (
            <button
              type="button"
              className={styles.speak}
              onClick={() => playClip(clip.src)}
              aria-label={`Play pronunciation of ${spoken.word}`}
            >
              <SpeakerIcon />
            </button>
          )}
        </div>

        {entry?.form?.ipa && <p className={styles.ipa}>{entry.form.ipa}</p>}

        {clip && spoken && (
          <p className={styles.audioNote}>
            Recorded by a native speaker
            {spoken.word.toLowerCase() !== token.text.toLowerCase() &&
              ` — the base form “${spoken.word}”`}
            {clip.tags.length > 0 && ` (${clip.tags.join(", ")})`}
          </p>
        )}

        {entry && !clip && (
          <p className={styles.audioNote}>No native recording available for this word.</p>
        )}

        {entry?.inflectionOf && (
          <p className={styles.inflection}>
            {entry.inflectionNote || `form of ${entry.inflectionOf}`}
          </p>
        )}

        {senseSource ? (
          <Senses lexeme={senseSource} />
        ) : (
          <p className={styles.empty}>No dictionary entry found for this word.</p>
        )}

        <div className={styles.actions}>
          {onPlayFromWord && (
            <button type="button" className={styles.action} onClick={onPlayFromWord}>
              Play text from here
            </button>
          )}
          {entry?.form && (
            <a
              className={styles.action}
              href={entry.form.wiktionaryUrl}
              target="_blank"
              rel="noreferrer"
            >
              Wiktionary
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}

function Senses({ lexeme }: { lexeme: LexemeInfo }) {
  return (
    <div className={styles.senses}>
      {lexeme.groups.map((group, groupIndex) => {
        const article = group.pos === "noun" ? genderArticle(group.gender) : null;
        return (
          <section key={`${group.pos}${groupIndex}`} className={styles.group}>
            <h4 className={styles.pos}>
              {posLabel(group.pos)}
              {article && <span className={styles.article}>{article}</span>}
            </h4>
            <ol className={styles.glosses}>
              {group.senses.map((sense, senseIndex) => (
                <li key={senseIndex}>
                  {sense.tags.length > 0 && (
                    <span className={styles.tags}>{sense.tags.join(", ")}</span>
                  )}
                  {sense.gloss}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M7 3L4 5.8H2v4.4h2L7 13z" fill="currentColor" />
      <path
        d="M10 5.6a3.2 3.2 0 010 4.8M11.9 3.4a6 6 0 010 9.2"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

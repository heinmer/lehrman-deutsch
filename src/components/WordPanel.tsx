import { useCallback, useRef } from "react";
import { CornerDownRight, MousePointerClick, Volume2, X } from "lucide-react";
import type { DictionaryEntry, LexemeInfo, WordToken } from "../../shared/types";
import { genderArticle, posLabel } from "../lib/format";
import styles from "./WordPanel.module.css";

interface Props {
  /** Null when no word is selected — the island stays, holding its place. */
  token: WordToken | null;
  entry: DictionaryEntry | null;
  onClose: () => void;
}

export function WordPanel({ token, entry, onClose }: Props) {
  const clipRef = useRef<HTMLAudioElement | null>(null);

  const playClip = useCallback((src: string) => {
    clipRef.current?.pause();
    const clip = new Audio(src);
    clipRef.current = clip;
    void clip.play();
  }, []);

  if (!token) {
    return (
      <aside className={`island ${styles.panel}`} aria-label="Word details">
        <div className={styles.placeholder}>
          <MousePointerClick size={30} strokeWidth={1.5} />
          <p>Click any word to hear it and see what it means.</p>
        </div>
      </aside>
    );
  }

  // An inflected form rarely has a recording of its own; the lemma's is the
  // next best thing, and it is labelled with the form actually spoken.
  const spoken = entry?.form?.audio ? entry.form : entry?.lemma?.audio ? entry.lemma : null;
  const clip = spoken?.audio ?? null;
  // Inflected forms carry no meaning of their own — the lemma holds it.
  const senseSource = entry?.form?.groups.length ? entry.form : entry?.lemma ?? null;
  const spokenDiffers = Boolean(spoken && spoken.word.toLowerCase() !== token.text.toLowerCase());

  return (
    <aside className={`island ${styles.panel}`} aria-label="Word details">
      <div className={styles.top}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={20} strokeWidth={2.25} />
        </button>
      </div>

      <div className={styles.body}>
        <h3 className={styles.word}>{token.text}</h3>

        <div className={styles.pronunciation}>
          <button
            type="button"
            className={styles.speak}
            onClick={clip ? () => playClip(clip.src) : undefined}
            disabled={!clip}
            aria-label={clip ? `Play ${spoken?.word}` : "No recording available"}
            title={clip ? undefined : "No native recording for this word"}
          >
            <Volume2 size={26} strokeWidth={2} />
          </button>

          <div className={styles.pronunciationText}>
            {entry?.form?.ipa && <p className={styles.ipa}>{entry.form.ipa}</p>}
            {spokenDiffers && spoken && (
              <p className={styles.spokenAs}>
                <CornerDownRight size={15} strokeWidth={2} />
                {spoken.word}
              </p>
            )}
          </div>
        </div>

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
                    <span className={styles.tags}>{sense.tags.join(" · ")}</span>
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

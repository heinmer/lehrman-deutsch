import { CornerDownRight, MousePointerClick, Play, Volume2, X } from "lucide-react";
import type { ClipCredit, DictionaryEntry, LexemeInfo, WordToken } from "../../shared/types";
import { genderArticle, posLabel } from "../lib/format";
import { spokenLexeme } from "../lib/pronunciation";
import { playClip } from "../lib/clipAudio";
import { creditFor, useCredits } from "../hooks/useCredits";
import styles from "./WordPanel.module.css";

interface Props {
  /** Null when no word is selected — the island stays, holding its place. */
  token: WordToken | null;
  entry: DictionaryEntry | null;
  onClose: () => void;
  /** Plays the narration from this word, paused or not. */
  onPlayFrom: () => void;
  /** False when the word has no timing, or the narration is still loading. */
  canPlayFrom: boolean;
}

export function WordPanel({ token, entry, onClose, onPlayFrom, canPlayFrom }: Props) {
  // Before the early return, as every hook must be — and asked for only once
  // the panel is showing a word, so the file is not on the opening page.
  const credits = useCredits(Boolean(token));

  if (!token) {
    return (
      <aside className={`island ${styles.panel}`} aria-label="Word details">
        <div className={styles.placeholder}>
          <MousePointerClick size={52} strokeWidth={1.4} />
          <p>Click any word to hear it and see what it means.</p>
        </div>
      </aside>
    );
  }

  const spoken = spokenLexeme(entry);
  const clip = spoken?.audio ?? null;
  // Inflected forms carry no meaning of their own — the lemma holds it.
  const senseSource = entry?.form?.groups.length ? entry.form : entry?.lemma ?? null;
  const spokenDiffers = Boolean(spoken && spoken.word.toLowerCase() !== token.text.toLowerCase());

  return (
    <aside className={`island ${styles.panel}`} aria-label="Word details">
      <div className={styles.top}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={24} strokeWidth={2.25} />
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
          <div className={styles.inflection}>
            <p className={styles.inflectionNote}>
              {entry.inflectionNote || `form of ${entry.inflectionOf}`}
            </p>
            {/* Many inflected spellings have no transcription of their own;
                the lemma's is shown as the lemma's, never as this word's. */}
            {entry.lemma?.ipa && (
              <p className={styles.lemmaLine}>
                <span className={styles.lemmaWord}>{entry.lemma.word}</span>
                <span className={styles.lemmaIpa}>{entry.lemma.ipa}</span>
              </p>
            )}
          </div>
        )}

        {senseSource ? (
          <Senses lexeme={senseSource} />
        ) : (
          <p className={styles.empty}>No dictionary entry found for this word.</p>
        )}

        <Credit lexeme={senseSource} clip={creditFor(credits, clip?.file)} />
      </div>

      {/* Outside the scrolling body, so the senses above end before it rather
          than sliding underneath. */}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.playFrom}
          onClick={onPlayFrom}
          disabled={!canPlayFrom}
          title={canPlayFrom ? undefined : "This word has no timing in the recording"}
        >
          <Play size={18} strokeWidth={2.25} />
          Read from here
        </button>
      </div>
    </aside>
  );
}

/**
 * Where this entry and this recording came from, at the foot of the body.
 *
 * It is the conventional place and shape for a source note — under the content
 * it belongs to, a step smaller and quieter than everything else — which is
 * what lets it be read as a credit and skipped as one. It is deliberately not
 * beside the speak button: that is a control read at a glance, and hanging a
 * licence off it would cost the panel the one element that needs no reading
 * at all.
 *
 * Both halves stand on their own. The dictionary is CC BY-SA and the recordings
 * carry a licence each — CC BY-SA at three versions, CC BY and CC0 are all in
 * there — so the recording names its own rather than borrowing a sentence
 * written once for all of them. Each links out to where the rest is said, which
 * is what the licences accept in place of reprinting it here.
 */
function Credit({ lexeme, clip }: { lexeme: LexemeInfo | null; clip: ClipCredit | null }) {
  if (!lexeme?.wiktionaryUrl && !clip) return null;

  return (
    <p className={styles.credit}>
      {lexeme?.wiktionaryUrl && (
        <a href={lexeme.wiktionaryUrl} target="_blank" rel="noreferrer">
          Wiktionary
        </a>
      )}
      {lexeme?.wiktionaryUrl && clip && (
        <>
          {" "}
          <span className={styles.creditDot} aria-hidden="true">
            ·
          </span>{" "}
        </>
      )}
      {clip && (
        <span>
          {clip.author ? "recording by " : "recording "}
          <a href={clip.page} target="_blank" rel="noreferrer">
            {clip.author ?? "on Commons"}
          </a>
          {clip.license && ` (${clip.license})`}
        </span>
      )}
    </p>
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

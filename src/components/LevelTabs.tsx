import { LEVELS, type Level } from "../../shared/types";
import styles from "./LevelTabs.module.css";

interface Props {
  selected: Level;
  /** How many texts each level holds. A level with none cannot be chosen. */
  counts: Record<Level, number>;
  onSelect: (level: Level) => void;
}

/**
 * The CEFR scale as one segmented strip over the text list: which level is
 * being browsed, and — because every level is drawn whether or not it holds
 * anything yet — how far the course goes.
 *
 * A group of pressed buttons rather than the ARIA tabs pattern, like the
 * player's speed strip: the list underneath is a `nav` landmark and not a tab
 * panel, and what these say about themselves ("A1, pressed") is what they do.
 */
export function LevelTabs({ selected, counts, onSelect }: Props) {
  return (
    <div className={styles.strip} role="group" aria-label="Difficulty level">
      {LEVELS.map((level) => {
        const count = counts[level];
        return (
          <button
            key={level}
            type="button"
            className={styles.tab}
            data-level={level}
            aria-pressed={level === selected}
            // A level nothing is written for yet is shown and not offered:
            // there is no empty list to explain, and the scale stays whole.
            disabled={count === 0}
            title={
              count === 0
                ? `No ${level} texts yet`
                : `${count} ${count === 1 ? "text" : "texts"} at ${level}`
            }
            onClick={() => onSelect(level)}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

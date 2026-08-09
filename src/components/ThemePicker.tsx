import { Fragment } from "react";
import { THEMES } from "../lib/themes";
import styles from "./ThemePicker.module.css";

interface Props {
  themeId: string;
  onSelect: (id: string) => void;
}

/** All themes at once, as a row of dots — no menu to open. */
export function ThemePicker({ themeId, onSelect }: Props) {
  return (
    <div className={styles.row} role="radiogroup" aria-label="Theme">
      {THEMES.map((theme, index) => (
        <Fragment key={theme.id}>
          {index > 0 && THEMES[index - 1].mode !== theme.mode && (
            <span className={styles.divider} aria-hidden="true" />
          )}
          <button
            type="button"
            role="radio"
            aria-checked={theme.id === themeId}
            aria-label={theme.name}
            className={styles.dot}
            onClick={() => onSelect(theme.id)}
          >
            <span
              className={styles.disc}
              style={{
                background: `linear-gradient(135deg, ${theme.swatch[0]} 0 50%, ${theme.swatch[1]} 50% 100%)`,
              }}
            />
            <span className={styles.tooltip} aria-hidden="true">
              {theme.name}
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

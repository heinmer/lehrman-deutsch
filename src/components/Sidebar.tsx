import type { TextSummary } from "../../shared/types";
import type { Theme } from "../hooks/useTheme";
import { formatTime } from "../lib/format";
import styles from "./Sidebar.module.css";

interface Props {
  texts: TextSummary[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function Sidebar({ texts, activeSlug, onSelect, theme, onToggleTheme }: Props) {
  return (
    <aside className={styles.sidebar}>
      <header className={styles.header}>
        <h1 className={styles.title}>Texts in German</h1>
      </header>

      <nav className={styles.list} aria-label="Texts">
        {texts.map((text) => (
          <button
            key={text.slug}
            type="button"
            className={styles.item}
            aria-current={text.slug === activeSlug}
            onClick={() => onSelect(text.slug)}
          >
            <span className={styles.itemTitle}>{text.title}</span>
            <span className={styles.itemMeta}>
              <span className={styles.level}>{text.level}</span>
              <span>{text.wordCount} words</span>
              <span>{formatTime(text.durationSec)}</span>
            </span>
          </button>
        ))}
      </nav>

      <footer className={styles.footer}>
        <button type="button" className={styles.themeButton} onClick={onToggleTheme}>
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </footer>
    </aside>
  );
}

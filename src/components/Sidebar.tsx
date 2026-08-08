import { BookOpen, Clock, Moon, Sun, Type, Volume2, VolumeX } from "lucide-react";
import type { TextSummary } from "../../shared/types";
import type { ThemeControls } from "../hooks/useTheme";
import { formatTime } from "../lib/format";
import { LevelBadge } from "./LevelBadge";
import { ThemePicker } from "./ThemePicker";
import styles from "./Sidebar.module.css";

interface Props {
  texts: TextSummary[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
  theme: ThemeControls;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
}

export function Sidebar({
  texts,
  activeSlug,
  onSelect,
  theme,
  autoSpeak,
  onToggleAutoSpeak,
}: Props) {
  const isDark = theme.theme?.mode === "dark";
  return (
    <aside className={`island ${styles.sidebar}`}>
      <header className={styles.header}>
        <BookOpen size={24} strokeWidth={1.75} className={styles.logo} />
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
            <LevelBadge level={text.level} size="sm" />
            <span className={styles.itemBody}>
              <span className={styles.itemTitle}>{text.title}</span>
              <span className={styles.itemMeta}>
                <span className={styles.metaPart}>
                  <Type size={14} strokeWidth={2} />
                  {text.wordCount}
                </span>
                <span className={styles.metaPart}>
                  <Clock size={14} strokeWidth={2} />
                  {formatTime(text.durationSec)}
                </span>
              </span>
            </span>
          </button>
        ))}
      </nav>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.setting}
          onClick={theme.toggleMode}
          title={isDark ? "Switch to the light theme" : "Switch to the dark theme"}
        >
          {isDark ? <Sun size={19} strokeWidth={2} /> : <Moon size={19} strokeWidth={2} />}
          {isDark ? "Light" : "Dark"}
        </button>

        <ThemePicker
          themeId={theme.themeId}
          theme={theme.theme}
          onSelect={theme.setTheme}
        />

        <button
          type="button"
          className={styles.setting}
          onClick={onToggleAutoSpeak}
          aria-pressed={autoSpeak}
          title="Play a word's recording when you click it, while the narration is paused"
        >
          {autoSpeak ? <Volume2 size={19} strokeWidth={2} /> : <VolumeX size={19} strokeWidth={2} />}
          Say word
        </button>
      </footer>
    </aside>
  );
}

import { BookOpen, Clock, LocateFixed, LocateOff, Type, Volume2, VolumeX } from "lucide-react";
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
  seekOnClick: boolean;
  onToggleSeekOnClick: () => void;
}

export function Sidebar({
  texts,
  activeSlug,
  onSelect,
  theme,
  autoSpeak,
  onToggleAutoSpeak,
  seekOnClick,
  onToggleSeekOnClick,
}: Props) {
  return (
    <aside className={`island ${styles.sidebar}`} data-tooltip-boundary>
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
        <p className={styles.settingLabel}>Theme</p>
        <ThemePicker themeId={theme.themeId} onSelect={theme.setTheme} />

        <div className={styles.settingRow}>
          <button
            type="button"
            className={styles.setting}
            onClick={onToggleAutoSpeak}
            aria-pressed={autoSpeak}
          >
            {autoSpeak ? (
              <Volume2 size={19} strokeWidth={2} />
            ) : (
              <VolumeX size={19} strokeWidth={2} />
            )}
            Say word
          </button>

          <button
            type="button"
            className={styles.setting}
            onClick={onToggleSeekOnClick}
            aria-pressed={seekOnClick}
          >
            {seekOnClick ? (
              <LocateFixed size={19} strokeWidth={2} />
            ) : (
              <LocateOff size={19} strokeWidth={2} />
            )}
            Jump to word
          </button>
        </div>
      </footer>
    </aside>
  );
}

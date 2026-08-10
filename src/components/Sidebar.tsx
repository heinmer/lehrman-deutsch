import {
  BookOpen,
  Clock,
  Image,
  ImageOff,
  LocateFixed,
  LocateOff,
  Megaphone,
  Type,
} from "lucide-react";
import type { TextSummary } from "../../shared/types";
import { forVoice } from "../../shared/voices";
import type { ThemeControls } from "../hooks/useTheme";
import type { VolumeSetting } from "../hooks/useVolumeSetting";
import { formatTime } from "../lib/format";
import { LevelBadge } from "./LevelBadge";
import { ThemePicker } from "./ThemePicker";
import { VolumeControl } from "./VolumeControl";
import styles from "./Sidebar.module.css";

interface Props {
  texts: TextSummary[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
  theme: ThemeControls;
  /** Only to show each text's length; the voice itself is chosen in the player. */
  voiceId: string;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
  seekOnClick: boolean;
  onToggleSeekOnClick: () => void;
  showImage: boolean;
  onToggleShowImage: () => void;
  volume: VolumeSetting;
}

/** How long this text runs in the chosen voice; each reads at its own pace. */
function durationOf(text: TextSummary, voiceId: string): number {
  return forVoice(text.durations, voiceId) ?? 0;
}

export function Sidebar({
  texts,
  activeSlug,
  onSelect,
  theme,
  voiceId,
  autoSpeak,
  onToggleAutoSpeak,
  seekOnClick,
  onToggleSeekOnClick,
  showImage,
  onToggleShowImage,
  volume,
}: Props) {
  return (
    // The sidebar clips its overflow, so anything floating inside it — the
    // tooltips, the pickers' menus — measures itself against this.
    <aside className={`island ${styles.sidebar}`} data-popover-boundary>
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
                  {formatTime(durationOf(text, voiceId))}
                </span>
              </span>
            </span>
          </button>
        ))}
      </nav>

      <footer className={styles.footer}>
        <ThemePicker
          themeId={theme.themeId}
          theme={theme.theme}
          onSelect={theme.setTheme}
        />

        <button
          type="button"
          className="control"
          onClick={onToggleAutoSpeak}
          aria-pressed={autoSpeak}
        >
          {/* MegaphoneOff exists, but reads as "silenced" rather than "this
              setting is off", so the pressed state carries the difference —
              the control already recolours itself. */}
          <Megaphone size={19} strokeWidth={2} />
          Say word
        </button>

        <button
          type="button"
          className="control"
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

        <VolumeControl {...volume} />

        <button
          type="button"
          className="control"
          onClick={onToggleShowImage}
          aria-pressed={showImage}
        >
          {showImage ? (
            <Image size={19} strokeWidth={2} />
          ) : (
            <ImageOff size={19} strokeWidth={2} />
          )}
          Show image
        </button>
      </footer>
    </aside>
  );
}

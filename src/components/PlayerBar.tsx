import type { CSSProperties } from "react";
import { Library, Pause, Play, RotateCw, SkipBack } from "lucide-react";
import type { Narration } from "../hooks/useNarration";
import { formatTime } from "../lib/format";
import { VoicePicker } from "./VoicePicker";
import styles from "./PlayerBar.module.css";

const RATES = [0.5, 0.75, 1] as const;

interface Props {
  narration: Narration;
  voiceId: string;
  onSelectVoice: (id: string) => void;
  /** Only reachable on narrow screens, where the sidebar is a drawer. */
  onOpenDrawer: () => void;
}

export function PlayerBar({ narration, voiceId, onSelectVoice, onOpenDrawer }: Props) {
  const { isPlaying, isReady, error, currentTime, duration, rate } = narration;

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) * 100 : 0;

  return (
    // The voice menu opens out of the bar and has to measure itself against it.
    <div className={`island ${styles.bar}`} data-popover-boundary data-failed={error || undefined}>
      {/* The way back to the text list and the settings once they have left
          the layout. It is drawn as an island of its own above the bar's left
          corner, not as a control in the row — the bar is only what it is
          anchored to. CSS hides it wherever the sidebar is visible. */}
      <button
        type="button"
        className={styles.library}
        onClick={onOpenDrawer}
        aria-label="Texts and settings"
        title="Texts and settings"
      >
        <Library size={28} strokeWidth={2} />
      </button>

      <button
        type="button"
        className={styles.play}
        onClick={narration.toggle}
        disabled={!isReady}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause size={24} strokeWidth={2} fill="currentColor" />
        ) : (
          <Play size={24} strokeWidth={2} fill="currentColor" />
        )}
      </button>

      {/* Back to the first word. Seeking never changes play state, so this
          restarts a running narration and rewinds a paused one. */}
      <button
        type="button"
        className={styles.restart}
        onClick={() => narration.seek(0)}
        disabled={!isReady}
        aria-label="Restart from the beginning"
        title="Back to the beginning"
      >
        <SkipBack size={20} strokeWidth={2} fill="currentColor" />
      </button>

      {/* A reading that never loaded leaves every control dead and, until this
          existed, said nothing at all about why. The message takes the
          scrubber's place because that is the control it explains. */}
      {error ? (
        <div className={styles.failed} role="alert">
          <span>{error}</span>
          <button type="button" className={styles.retry} onClick={narration.reload}>
            <RotateCw size={18} strokeWidth={2} />
            Try again
          </button>
        </div>
      ) : (
        <>
          {/* Clicking anywhere on the track jumps there — that is native range
              behaviour, and the track is sized to make it an easy target. */}
          <input
            type="range"
            className={styles.scrubber}
            style={{ "--progress": `${progress}%` } as CSSProperties}
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => narration.seek(Number(event.target.value))}
            disabled={!isReady}
            aria-label="Seek"
          />

          <div className={styles.time}>
            <span className={styles.timeNow}>{formatTime(currentTime)}</span>
            <span className={styles.timeSep}>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </>
      )}

      <div className={styles.speed}>
        <div className={styles.rates} role="group" aria-label="Playback speed">
          {RATES.map((value) => (
            <button
              key={value}
              type="button"
              className={styles.rate}
              aria-pressed={rate === value}
              onClick={() => narration.changeRate(value)}
            >
              {value}&times;
            </button>
          ))}
        </div>
      </div>

      <div className={styles.voice}>
        <VoicePicker voiceId={voiceId} onSelect={onSelectVoice} />
      </div>
    </div>
  );
}

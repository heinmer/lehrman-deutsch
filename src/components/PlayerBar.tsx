import type { CSSProperties } from "react";
import { Gauge, Pause, Play } from "lucide-react";
import type { Narration } from "../hooks/useNarration";
import { formatTime } from "../lib/format";
import styles from "./PlayerBar.module.css";

const RATES = [0.5, 0.75, 1] as const;

export function PlayerBar({ narration }: { narration: Narration }) {
  const { isPlaying, isReady, currentTime, duration, rate } = narration;

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) * 100 : 0;

  return (
    <div className={`island ${styles.bar}`}>
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

      <div className={styles.speed}>
        <Gauge size={17} strokeWidth={2} className={styles.speedIcon} />
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
    </div>
  );
}

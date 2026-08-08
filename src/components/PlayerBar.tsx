import type { Narration } from "../hooks/useNarration";
import { formatTime } from "../lib/format";
import styles from "./PlayerBar.module.css";

const RATES = [0.75, 1, 1.25] as const;

export function PlayerBar({ narration }: { narration: Narration }) {
  const { isPlaying, isReady, currentTime, duration, rate } = narration;

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.play}
        onClick={narration.toggle}
        disabled={!isReady}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <span className={styles.time}>{formatTime(currentTime)}</span>

      <input
        type="range"
        className={styles.scrubber}
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => narration.seek(Number(event.target.value))}
        disabled={!isReady}
        aria-label="Seek"
      />

      <span className={styles.time}>{formatTime(duration)}</span>

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
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
    </svg>
  );
}

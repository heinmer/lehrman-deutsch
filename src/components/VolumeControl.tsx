import type { CSSProperties } from "react";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import type { VolumeSetting } from "../hooks/useVolumeSetting";
import styles from "./VolumeControl.module.css";

/** Bars on the speaker, the way every other player draws the level. */
function VolumeIcon({ level }: { level: number }) {
  const props = { size: 19, strokeWidth: 2 } as const;
  if (level <= 0) return <VolumeX {...props} />;
  if (level < 0.34) return <Volume {...props} />;
  if (level < 0.67) return <Volume1 {...props} />;
  return <Volume2 {...props} />;
}

/**
 * The output level for both the narration and the word clips: a round button
 * that mutes on click, with a vertical slider that opens on hover. The
 * slider's wrapper reaches down to the button so the pointer can travel
 * between them without crossing a gap and dismissing it.
 */
export function VolumeControl({ volume, muted, effective, setVolume, toggleMuted }: VolumeSetting) {
  const percent = Math.round(effective * 100);

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={`control ${styles.button}`}
        data-muted={muted}
        onClick={toggleMuted}
        aria-label={muted ? `Unmute (volume ${Math.round(volume * 100)}%)` : "Mute"}
        title={muted ? "Muted" : `Volume ${percent}%`}
      >
        <VolumeIcon level={effective} />
      </button>

      <div className={styles.popover}>
        {/* --fill paints the part of the track below the thumb. */}
        <div className={styles.card} style={{ "--fill": `${percent}%` } as CSSProperties}>
          {/* The track is drawn by the wrapper: Chromium lays a vertical
              slider's own track out against the inline edge, which leaves the
              thumb off centre. */}
          <div className={styles.sliderWrap}>
            <input
              type="range"
              className={styles.slider}
              min={0}
              max={1}
              step={0.01}
              value={effective}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

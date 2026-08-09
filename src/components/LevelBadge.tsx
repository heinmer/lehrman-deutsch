import type { Level } from "../../shared/types";
import styles from "./LevelBadge.module.css";

/**
 * A scalloped disc — a circle with a gently waving edge, rather than a star
 * with sharp points. The outline is a polar curve: a base radius with a small
 * cosine ripple, sampled finely enough that the lobes read as smooth.
 */
function scallopedPath(lobes = 12, ripple = 0.075, samples = 360): string {
  const centre = 50;
  const base = 43;
  const points: string[] = [];

  for (let i = 0; i <= samples; i += 1) {
    const angle = (i / samples) * Math.PI * 2;
    const radius = base * (1 + ripple * Math.cos(lobes * angle));
    const x = centre + radius * Math.cos(angle);
    const y = centre + radius * Math.sin(angle);
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return `${points.join("")}Z`;
}

const SHAPE = scallopedPath();

/** CEFR level on a scalloped badge. */
export function LevelBadge({ level, size = "md" }: { level: Level; size?: "sm" | "md" }) {
  return (
    <span className={styles.badge} data-size={size} title={`CEFR level ${level}`}>
      <svg className={styles.shape} viewBox="0 0 100 100" aria-hidden="true">
        <path d={SHAPE} fill="currentColor" />
      </svg>
      <span className={styles.label}>{level}</span>
    </span>
  );
}

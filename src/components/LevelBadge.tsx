import type { Level } from "../../shared/types";
import styles from "./LevelBadge.module.css";

/** CEFR level as a round chip — small, but always legible. */
export function LevelBadge({ level, size = "md" }: { level: Level; size?: "sm" | "md" }) {
  return (
    <span className={styles.badge} data-size={size} title={`CEFR level ${level}`}>
      {level}
    </span>
  );
}

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Tooltip.module.css";

interface Props {
  label: string;
  children: ReactNode;
}

/** Distance kept between a tooltip and the edge of its boundary. */
const EDGE_MARGIN = 8;

/**
 * A hover label that stays inside its container.
 *
 * It is centred on its trigger and only nudged sideways by the amount needed
 * to fit — so a short label near an edge still sits centred, while a long one
 * slides just far enough to stay readable. The boundary is the nearest ancestor
 * marked with `data-tooltip-boundary`, falling back to the viewport.
 */
export function Tooltip({ label, children }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const [open, setOpen] = useState(false);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;

    const trigger = wrap.getBoundingClientRect();
    const width = tip.offsetWidth;

    const boundaryEl = wrap.closest<HTMLElement>("[data-tooltip-boundary]");
    const bounds = boundaryEl?.getBoundingClientRect() ?? {
      left: 0,
      right: window.innerWidth,
    };

    // Where the tooltip would sit if perfectly centred on the trigger.
    const centred = trigger.left + trigger.width / 2 - width / 2;
    const min = bounds.left + EDGE_MARGIN;
    const max = bounds.right - EDGE_MARGIN - width;

    // max < min means the label is wider than the boundary; favour the left
    // edge, where reading starts.
    const clamped = max < min ? min : Math.min(Math.max(centred, min), max);
    setShift(clamped - centred);
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  return (
    <span
      className={styles.wrap}
      ref={wrapRef}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      <span
        className={styles.tip}
        ref={tipRef}
        data-open={open}
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
        aria-hidden="true"
      >
        {label}
      </span>
    </span>
  );
}

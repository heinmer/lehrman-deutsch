import { useEffect, useRef, useState } from "react";

/** Long enough that a fetch off the local disk never reaches it. */
const DELAY_MS = 400;
/** Once raised, it stays this long even if the wait ends immediately after. */
const MINIMUM_MS = 300;

/**
 * Follows `active`, but late to say yes and slow to say no — which is how a
 * loading indicator is kept from flashing.
 *
 * A spinner that appears for 80ms is read as something twitching rather than
 * as something loading, so it waits `delay` before rising at all; most loads
 * here finish inside that and never draw one. The minimum is the same problem
 * at the other end: without it a wait of `delay + 20ms` would show the spinner
 * for those 20ms, which is exactly the flash the delay was there to avoid.
 *
 * The caller has to hold the *whole* loading state while this is true, not
 * just the spinner inside it — otherwise the arriving content replaces the
 * state the spinner lives in and the minimum never binds. That is the one
 * thing this hook cannot do for itself, and it was got wrong first time.
 *
 * The lowering is scheduled rather than done on the spot even when nothing is
 * left to wait for — setting state straight from an effect is what
 * `react-hooks/set-state-in-effect` is about, and a timeout of 0 costs a tick.
 */
export function useDelayedFlag(
  active: boolean,
  delay = DELAY_MS,
  minimum = MINIMUM_MS,
): boolean {
  const [raised, setRaised] = useState(false);
  const raisedAt = useRef(0);

  useEffect(() => {
    if (active === raised) return undefined;

    const wait = active ? delay : Math.max(0, minimum - (performance.now() - raisedAt.current));
    const timer = setTimeout(() => {
      if (active) raisedAt.current = performance.now();
      setRaised(active);
    }, wait);

    return () => clearTimeout(timer);
  }, [active, raised, delay, minimum]);

  return raised;
}

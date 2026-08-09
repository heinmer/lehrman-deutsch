import { useCallback, useEffect, useState } from "react";

/**
 * Which text is being read, kept in the address bar.
 *
 * A hash route, not a path: this is a static site with no server of its own,
 * and a path route only works where something rewrites unknown paths back to
 * index.html. A file host, a project page and a plain bucket all do not. The
 * hash survives every one of them, and survives a base prefix for free.
 *
 * The only state here is what the hash says; which text that means is derived,
 * because a slug is not a text until the index says it is one.
 */

function slugFromHash(): string | null {
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    // A hash somebody typed by hand can be invalid percent-encoding.
    return raw;
  }
}

export function useSlugRoute(known: readonly string[]): [string | null, (slug: string) => void] {
  const [hashSlug, setHashSlug] = useState(slugFromHash);

  useEffect(() => {
    const sync = () => setHashSlug(slugFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Before the index has loaded there is nothing to validate against, and a
  // slug that turns out not to exist would be fetched for nothing.
  const slug =
    known.length === 0
      ? null
      : hashSlug && known.includes(hashSlug)
        ? hashSlug
        : (known[0] ?? null);

  // Keep the address honest about what is on screen. Replaced rather than
  // pushed: an address that named no text should not be somewhere Back can
  // return to.
  useEffect(() => {
    if (slug && slugFromHash() !== slug) {
      window.location.replace(`#/${encodeURIComponent(slug)}`);
    }
  }, [slug]);

  // Pushed, so Back returns to the text that was being read.
  const select = useCallback((next: string) => {
    window.location.hash = `/${encodeURIComponent(next)}`;
  }, []);

  return [slug, select];
}

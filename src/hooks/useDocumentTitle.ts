import { useEffect } from "react";

/**
 * The name `index.html` carries, which is what the tab reads before the app
 * has anything to say — and what it goes back to when no text is open.
 */
const SITE_NAME = "Lehrman-Deutsch";

/**
 * Names the tab after the text being read, and after the site alone when there
 * is none — which is the moment before the index arrives, and the state it
 * stays in if the index never does.
 *
 * The site's name stays on the end rather than being replaced: a tab strip is
 * mostly the first few characters of a title, but a history entry and a
 * bookmark are the whole of it, and neither says where it leads without it.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  }, [title]);
}

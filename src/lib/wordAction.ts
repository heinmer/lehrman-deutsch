/**
 * What a click on a word means.
 *
 * The modifiers do not bend the settings, they replace them: each one names a
 * whole behaviour, so what happens is the same whether "Say word" and "Jump"
 * are on or off, and whether or not the narration is running.
 */
export type WordAction =
  /** Whatever the settings say — the plain click. */
  | "open"
  /** Read the text from this word, and nothing else. */
  | "read"
  /** Look the word up, and nothing else. */
  | "inspect";

/** The part of a mouse or keyboard event this depends on. */
interface Modifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * Ctrl starts the narration at the word; Alt looks it up and touches nothing
 * else. Cmd counts as Ctrl because on a Mac Ctrl+click *is* the context menu,
 * and the shortcut has to be reachable there too.
 *
 * Ctrl wins when both are held: it is the one that makes a sound, and a chord
 * meaning a third thing would be a third shortcut nobody asked for.
 *
 * Shift is deliberately unused — it is how a browser extends a text selection,
 * and the words are ordinary inline text that a reader may want to copy.
 */
export function wordAction(event: Modifiers): WordAction {
  if (event.ctrlKey || event.metaKey) return "read";
  if (event.altKey) return "inspect";
  return "open";
}

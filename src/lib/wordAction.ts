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
  /** Open the word in the panel, and nothing else. */
  | "inspect"
  /** Play the word's own recording, and nothing else. */
  | "speak"
  /** Read the text from this word, and nothing else. */
  | "read";

/** The part of a mouse or keyboard event this depends on. */
interface Modifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  getModifierState(key: "AltGraph"): boolean;
}

/**
 * Ctrl looks the word up, Alt speaks it, and the two together read the text
 * from it. Cmd counts as Ctrl because on a Mac Ctrl+click *is* the context
 * menu, and the shortcuts have to be reachable there too.
 *
 * Shift is deliberately unused — it is how a browser extends a text
 * selection, and the words are ordinary inline text that a reader may want to
 * copy.
 *
 * **AltGr is one key that reports itself as Ctrl+Alt.** On a German layout —
 * which is not a far-fetched keyboard for this site — the right Alt is AltGr,
 * so somebody reaching for Alt+click with their right hand would otherwise
 * get the combination instead. Browsers expose the difference as a modifier
 * state of its own, so the one key is read as the one modifier it is.
 */
export function wordAction(event: Modifiers): WordAction {
  if (event.getModifierState("AltGraph")) return "speak";

  const primary = event.ctrlKey || event.metaKey;
  if (primary && event.altKey) return "read";
  if (primary) return "inspect";
  if (event.altKey) return "speak";
  return "open";
}

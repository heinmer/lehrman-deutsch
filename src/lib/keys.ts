/**
 * Whether the element under the keyboard answers to the spacebar itself, in
 * which case the player must not take it: a button activates on it, a field
 * types one. This is what keeps Space a transport key everywhere else.
 *
 * A range is the exception among inputs — it answers to the arrow keys and
 * does nothing at all with Space — so the scrubber having the focus is no
 * reason for the spacebar to stop working.
 *
 * The words in the reader are deliberately not here. They are `role="button"`
 * spans, so nothing native answers for them, and they give Space up to the
 * player and keep Enter.
 */
export function handlesSpace(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;

  switch (node.tagName) {
    case "BUTTON":
    case "SELECT":
    case "TEXTAREA":
    case "A":
    case "SUMMARY":
      return true;
    case "INPUT":
      return (node as HTMLInputElement).type !== "range";
    default:
      return false;
  }
}

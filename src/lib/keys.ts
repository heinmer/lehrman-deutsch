/**
 * Whether the spacebar belongs to the element that has the focus rather than
 * to the player: something the reader types into, where a space is a
 * character and not a command.
 *
 * **Buttons are deliberately not here, and that is the whole rule.** A button
 * answers to Space natively, so exempting them looked right — but a button
 * keeps the focus after being clicked, and nothing about that click asked for
 * it to stay armed: pressing Space after changing the theme re-opened the
 * theme menu, and after closing the info window re-opened the window, instead
 * of starting the text. Telling the two apart by how the focus arrived is
 * what `:focus-visible` is for, and it cannot be read from inside a keydown
 * handler — pressing a key is itself what makes the focused element
 * focus-visible, so it is true by the time the handler runs, every time. The
 * rule is therefore the flat one: Space is the player's, and a button is
 * reached from the keyboard with Enter, which every button here answers to.
 *
 * A range is the exception among inputs — it answers to the arrow keys and
 * does nothing at all with Space — so the scrubber having the focus is no
 * reason for the spacebar to stop working.
 *
 * Anything that claims Space for itself the ordinary way, by calling
 * `preventDefault` on the event, is not this function's business: the handler
 * in `App` lets a prevented event through untouched, which is how the pickers'
 * options keep it.
 */
export function ownsSpace(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;

  switch (node.tagName) {
    case "TEXTAREA":
    case "SELECT":
      return true;
    case "INPUT":
      return (node as HTMLInputElement).type !== "range";
    default:
      return false;
  }
}

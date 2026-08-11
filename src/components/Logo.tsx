/**
 * The site's mark: an "LD" monogram of vertical, horizontal and 45° edges on a
 * 100-unit grid, which is why every coordinate below is round and the path is
 * worth reading rather than regenerating.
 *
 * Three subpaths in one `d`, resolved by the default nonzero fill rule: the
 * silhouette (the L and the D meet at the single point 200,200), the D's
 * triangular counter wound the other way so it cuts a hole, and the detached
 * triangle at the lower right wound with the silhouette so it fills.
 *
 * `public/favicon.svg` carries the same path with a square viewBox around it.
 * Redrawing the mark means changing both — it is two copies of one shape, but
 * a static file under `public/` is not something the bundle can hand a
 * constant to, and the alternative was a Vite plugin for one glyph.
 */
const LOGO_PATH =
  "M0 0H100V200H200V0H400L500 100L300 300L200 200V300H100L0 200Z" +
  "M300 100V200L400 100Z" +
  "M500 200V300H400Z";

/**
 * Drawn in `currentColor`, so the colour is the host's to choose — in the
 * sidebar that is the theme's accent, the same one the name beside it takes.
 * Hidden from the reader, since that name says the same thing in words.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 500 300"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={LOGO_PATH} />
    </svg>
  );
}

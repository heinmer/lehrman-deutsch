/**
 * Where the generated files actually live.
 *
 * The pipeline writes every path relative to the site root — "/data/index.json",
 * "/media/words/de-schnee.mp3" — because at build time it has no idea where the
 * site will be served from. That is only the same thing as a URL when the site
 * sits at the root of its domain; under a prefix (a project page, a preview
 * deploy, a reverse proxy) a leading slash points at the wrong host root and
 * every fetch 404s.
 *
 * So nothing outside this module may hand a path from the data straight to
 * `fetch` or `new Audio`. Vite substitutes `BASE_URL` at build time from the
 * `base` option, which `vite.config.ts` takes from BASE_PATH.
 */
export function assetUrl(rootRelative: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}/${rootRelative.replace(/^\/+/, "")}`;
}

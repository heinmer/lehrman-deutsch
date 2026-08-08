# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Vite dev server on http://localhost:5173
npm run build            # tsc -b && vite build
npm run typecheck        # tsc -b --noEmit — the only automated check in the repo
npm run content          # regenerate audio + dictionary for changed texts (needs internet)
npm run content:force    # regenerate everything, ignoring the incremental cache
```

There is no test runner and no linter. `npm run typecheck` plus the browser
checks described under *Verifying UI and behaviour* are what stands in for them.

`npm run content` is slow on first run for a text (several minutes): Wikimedia
rate-limits hard, and `scripts/pipeline/http.ts` throttles to one request per
host per 350ms with exponential backoff on 429. Reruns are fast because
everything lands in `.cache/`.

## Architecture

Two halves that meet at one JSON contract, `shared/types.ts`:

- **Build time** (`scripts/`) — reads Markdown from `content/texts/`, hits the
  network, writes `public/data/*.json` and `public/media/**`.
- **Run time** (`src/`) — a React app that only ever *reads* those files. It
  never calls an external service.

`public/data/` and `public/media/` are generated and gitignored. Never hand-edit
them; change the pipeline or the source Markdown and rerun `npm run content`.

### The pipeline

`scripts/build-content.ts` orchestrates: tokenize → synthesize → align → look up
words → download recordings → write JSON. Per-stage modules live in
`scripts/pipeline/`.

Things that are easy to break:

- **Narration order is the contract for alignment.** `alignTimings` takes one
  flat `Sentence[]` that must be in the order the engine speaks it — title
  first, then body — because it walks tokens and TTS boundaries together with a
  shared cursor. Anything added to the narration text must also be added to
  that list, in the same position.
- **Boundaries are not one-to-one with tokens.** The engine sometimes reports
  two words in one event (`"Die Straße"`) and sometimes skips a token, so a
  boundary is consumed piece by piece and the aligner resynchronises within a
  small lookahead window. Word timings are what drives highlighting, so a
  regression here is silent — watch the `aligned N/M` line in the build log; it
  should stay at 100%.
- **Comparisons fold German spelling.** The engine is inconsistent about `ß`
  vs `ss`, so both sides go through `foldGerman` (`scripts/pipeline/util.ts`)
  before matching.
- **Only definitive answers get cached.** A rate-limited lookup must never be
  written to `.cache/` as "no such word" — that silently drops common words
  from the dictionary. Only 200s and 404s are cached.

### Dictionary sources

- **kaikki.org** (Wiktextract dumps of English Wiktionary) — senses, part of
  speech, gender, IPA, inflection→lemma, and Commons audio URLs.
- **de.wiktionary.org** — consulted only when the English edition has no IPA,
  which is common for inflected spellings (`bleibt`, `warmen`).
- **Wikimedia Commons** — native-speaker recordings, downloaded into
  `public/media/words/`. Standard German is preferred over Austrian/Swiss.

Lookups try several spellings (as written, lowercase, capitalized) because
German capitalizes nouns and a sentence-initial word says nothing about its
own case. IPA from either source is stripped of `/…/` or `[…]` and re-wrapped
as `/…/` so transcriptions look the same everywhere.

### App behaviour worth knowing

- **`seek` never changes play state.** Clicking a word and the restart button
  both rely on this: playing stays playing from the new position, paused stays
  paused. Do not "helpfully" call `play()` in either path.
- **Clicking a word plays its recording only while the narration is paused**,
  otherwise the clip would talk over the sentence. The "Say word" toggle in the
  sidebar disables it.
- **Word recordings go through the Web Audio API** (`src/lib/clipAudio.ts`),
  not `new Audio()`. They are volunteer contributions varying ~7x in loudness
  with ~0.5s of silence before the word, so each is decoded up front, scaled
  towards a common loudness and started at the first real sound. The prefetch
  is also what makes a click instant — playing must not trigger a fetch.
- **Words render as `<span role="button">`, never `<button>`.** Chrome lays
  buttons out as atomic inline boxes, which lets a line break fall between a
  word and the punctuation after it.
- **Playback position is polled with `requestAnimationFrame`**, because
  `timeupdate` fires ~4x a second — far too coarse to follow words.
- **Theme is applied by an inline script in `index.html`** before first paint;
  `useTheme` only keeps it in sync afterwards.
- The word panel's column is always in the grid, so opening it never shifts the
  text.

### Styling

Plain CSS Modules plus custom properties in `src/styles/global.css`. All
colours, spacing, radii and the type scale are tokens there — change the token,
not the component. Both themes must be defined: the light palette on `:root`,
the dark one under `:root[data-theme="dark"]`.

Two typefaces, deliberately: `--font-serif` (Newsreader) is used *only* for the
German prose; everything else uses `--font-sans` (DM Sans). Nothing in the UI
goes below `--fs-xs`.

## Adding a text

Drop a Markdown file with front matter into `content/texts/` and run
`npm run content`. Keys: `title`, `level`, `topic`, `slug`, `voice`, `rate`.
Blank lines separate paragraphs; sentences are detected with `Intl.Segmenter`.
The title is narrated and clickable like the body, so it counts as content.

## Verifying UI and behaviour

There is no browser automation dependency; Edge is driven directly over CDP
from throwaway scripts in the scratchpad (launch
`msedge.exe --headless=new --remote-debugging-port=…`, drive it with Node's
built-in `WebSocket`). This has been used to screenshot both themes
(`Emulation.setEmulatedMedia` for the colour scheme, and clear `localStorage`
first or the stored theme wins) and to assert behaviour — e.g. stubbing
`window.Audio` to count word clips, or watching `Network.requestWillBeSent` to
prove a click plays from memory. Prefer this over reasoning about the UI from
source alone; it has caught real bugs.

## Attribution

Dictionary content and recordings come from Wiktionary and Wikimedia Commons
under CC BY-SA. The credit currently lives in `README.md`, which covers local
personal use; if this is ever published, the credit belongs in the interface.

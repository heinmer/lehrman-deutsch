# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Keep it current: when a change invalidates something written here — a command,
a source of data, one of the invariants below — update this file in the same
commit. It is only useful while it is true.

## Committing

**Commit each change once it works.** Do not leave finished work sitting in the
working tree waiting to be asked about: typecheck it, check it in the browser
if it is visible, then commit. Several unrelated changes in one commit is the
thing to avoid — split them by subject instead of batching them up.

Messages follow the existing log: one line, imperative, sentence case, no
prefix or ticket, saying what the change does rather than which files moved —
*Drop the rule between the text list and the settings*, not *update CSS*. A
body is only worth adding when the reason is not obvious from the diff.

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

`npm run content` is slow the first time a text is built — minutes per text,
not seconds. Wikimedia rate-limits hard, so `scripts/pipeline/http.ts` starts at
one request per host per 350ms and **backs off further for the rest of the run**
once a host answers 429, easing back only while it keeps saying yes. Run it in
the background and keep working; watch the log rather than waiting on it.
Reruns are cheap because responses and audio land in `.cache/`.

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
- **Changing the document shape means bumping `PIPELINE_VERSION`**
  (`scripts/pipeline/config.ts`). It feeds the source hash, so without a bump
  the incremental build skips existing texts and they keep the old shape while
  the app expects the new one. Bumping it re-synthesises every narration, which
  costs a few minutes — that is the intended trade.

### Dictionary sources

- **kaikki.org** (Wiktextract dumps of English Wiktionary) — senses, part of
  speech, gender, IPA, inflection→lemma, and Commons audio URLs.
- **de.wiktionary.org** — consulted only when the English edition has no IPA,
  which is common for inflected spellings (`bleibt`, `warmen`).
- **Wikimedia Commons** — native-speaker recordings, downloaded into
  `public/media/words/`. Standard German is preferred over Austrian/Swiss.
- **Translations** (each paragraph, plus the title) — DeepL when
  `DEEPL_API_KEY` is set in the environment, otherwise MyMemory, which needs no
  credentials. Cached per provider, so switching providers re-translates rather
  than reusing the other one's output.

  MyMemory answers short strings with a zero-quality corpus match that simply
  echoes the source — titles came back untranslated or truncated until
  `translate.ts` learned to reject echoes and take the closest real alternative.
  Always eyeball `titleTranslation` after a build; it is the case most likely to
  degrade quietly.

Lookups try several spellings (as written, lowercase, capitalized) because
German capitalizes nouns and a sentence-initial word says nothing about its
own case. IPA from either source is stripped of `/…/` or `[…]` and re-wrapped
as `/…/` so transcriptions look the same everywhere.

### App behaviour worth knowing

- **`seek` never changes play state.** Clicking a word and the restart button
  both rely on this: playing stays playing from the new position, paused stays
  paused. Do not "helpfully" call `play()` in either path. The word panel's
  "Read from here" is the one deliberate exception — it seeks *and* calls
  `play()`, because asking to be read from a word is asking to hear it.
- **Clicking a word plays its recording only while the narration is paused**,
  otherwise the clip would talk over the sentence. Two sidebar toggles gate the
  click independently — "Say word" (speak it) and "Jump to word" (move the
  playhead); both live in `useToggleSetting` and persist.
- **Word recordings go through the Web Audio API** (`src/lib/clipAudio.ts`),
  not `new Audio()`. They are volunteer contributions varying ~7x in loudness
  with ~0.5s of silence before the word, so each is decoded up front, scaled
  towards a common loudness and started at the first real sound. The prefetch
  is also what makes a click instant — playing must not trigger a fetch.
- **One volume setting, two playback paths.** The sidebar's volume control
  (`useVolumeSetting`) feeds the narration element's `volume` *and*
  `setClipVolume` in `clipAudio.ts`, where it multiplies each clip's own
  normalising gain. A new path that makes a sound has to be told as well —
  nothing routes them through a shared node. Mute is stored apart from the
  level rather than as a level of zero, so unmuting returns to where the slider
  was left.
- **Chromium lays a vertical `<input type="range">` out against its inline
  edge**, which leaves the thumb hanging off the side of the track. The volume
  slider therefore keeps the native track transparent and draws its own on the
  wrapper, which is exactly as wide as the thumb. The drawn track is inset by
  half a thumb at each end so the fill and the thumb do not drift apart.
  The popover it lives in has no gap above the button — the hover area has to
  stay continuous, or the slider closes as the pointer travels to it.
- **Words render as `<span role="button">`, never `<button>`.** Chrome lays
  buttons out as atomic inline boxes, which lets a line break fall between a
  word and the punctuation after it.
- **The translate toggle is rendered inside its sentence, not after it**, as
  `SentenceView`'s `trailing`. Chromium allows a break in front of an atomic
  inline box with or without a space before it, so a toggle appended to the
  paragraph would regularly wrap onto a line by itself. Everything from the
  last word onwards — word, punctuation, toggle — sits in one `white-space:
  nowrap` span and wraps together. Removing a space is not enough; verify by
  sweeping window widths, not by looking at one.
- **Playback position is polled with `requestAnimationFrame`**, because
  `timeupdate` fires ~4x a second — far too coarse to follow words.
- **Theme is applied by an inline script in `index.html`** before first paint;
  `useTheme` only keeps it in sync afterwards.
- The word panel's column is always in the grid, so opening it never shifts the
  text.

### Styling

Plain CSS Modules plus custom properties. `src/styles/global.css` holds the
structural tokens (type scale, radii, spacing); `src/styles/themes.css` holds
every colour. Change the token, not the component — no component names a colour
directly, which is what makes new themes cheap.

**Adding a theme** means: a full token block in `themes.css` under
`:root[data-theme="<id>"]`, an entry in `src/lib/themes.ts` (its two swatch
colours are duplicated there for the picker dot), and the id added to the
`known` list in the inline script in `index.html`. Miss the last one and the
theme works until reload, then silently falls back.

A theme must define *every* token — a missing one is not inherited from another
theme, it simply goes unset and the declaration is dropped, which is silent.
Renaming a token means renaming it in the components too; grep for it.

`--island-border` separates the sections where the backgrounds cannot: the
layered themes need it because a drop shadow has nothing to darken. The
single-sheet themes — White, Black, Ink, Paper — set it to `transparent` on
purpose, along with `--shadow-card: none`: there page and sections share one
ground and are meant to read as a single sheet, so anything drawn between them
is a seam.

`--surface-raised` and `--surface-overlay` are both "a step above the page",
but only the overlay is guaranteed **opaque**. Raised may be a translucent
white — that is what gives the dark themes their lift — which is fine for
something sitting in the layout and wrong for anything floating over it: the
theme menu, the volume slider and the tooltip all showed the text list through
themselves until they moved to the overlay token. Anything that floats belongs
on `--surface-overlay`.

`--surface-selected` is the chosen option inside a segmented strip — today only
the playback speed. It has to clear `--surface-inset`, the strip *behind* it,
which is a different job from clearing the page: on the one-sheet themes
"raised" and that strip land within a hundredth of each other and the selection
vanishes. Measure the chip against the strip, not against the ground.

`--border` draws lines; `--track` fills areas that must read as "empty but
present" — the unplayed part of the scrubber, the ring around a theme dot, a
disabled button. They were one token until White needed strong section outlines
without turning the scrubber into a solid bar; keep the two roles apart.

White and Black keep pure `#fff`/`#000` **grounds only**. Everything on them is
tinted: body text is a very dark grey / off-white rather than pure ink, and the
accents keep the blue and green of the other themes. Do not "simplify" these
back to two literal colours.

Paper is the one theme whose accents are **not** blue and green. It is a
newsprint sheet with the blue filtered out of the whole palette, so its accents
are brick and olive; a cool accent on that warm ground is exactly what the
theme exists to avoid. Ink is the opposite case and follows the usual rule —
one deep navy ground where Dusk is navy in layers.

A one-off script that measures WCAG ratios across every theme has repeatedly
earned its keep — body text at AAA (7:1), and filled accent buttons against the
surface behind them, which is what caught the speak button vanishing into the
panel. Scratchpad scripts do not survive between sessions; rewrite it (see
*Verifying UI and behaviour*) rather than trusting the eye on a new theme.

Tailwind was considered and rejected: theming here is pure CSS variables, which
Tailwind v4 would express the same way, so a rewrite would buy nothing.

Two typefaces, deliberately: `--font-serif` (PT Serif) is used *only* for the
German prose; everything else uses `--font-sans` (DM Sans). Nothing in the UI
goes below `--fs-xs`.

## Adding a text

Drop a Markdown file with front matter into `content/texts/` and run
`npm run content` (in the background — see *Commands*). Blank lines separate
paragraphs; sentences are detected with `Intl.Segmenter`. The title is narrated
and clickable like the body, so it counts as content.

```markdown
---
title: Ein Tag am See
level: A1
topic: Summer
---

Es ist Sommer. Lena und Tom fahren mit dem Fahrrad zum See.

Nach einer Stunde kommen sie am See an.
```

| Key     | Default                             | Notes                              |
| ------- | ----------------------------------- | ---------------------------------- |
| `title` | file name                           | Narrated first, then the body      |
| `level` | `A1`                                | Sorts the sidebar; shown on a badge |
| `topic` | —                                   | Stored but not displayed anywhere  |
| `slug`  | file name                           | Output file and URL identifier     |
| `voice` | `de-DE-SeraphinaMultilingualNeural` | Any Edge German voice              |
| `rate`  | `-10%`                              | Speaking rate                      |

The sidebar sorts by level then title, so file names do not set the order.

**Write real German.** These are teaching texts: keep A1 to present tense and
simple clauses, and let A2 use Perfekt, subordinate clauses with `dass`/`weil`,
modals and separable verbs. Grammar errors here become errors the learner
memorises with audio attached.

**After the build, check the log rather than assuming:**

- `aligned N/M words (100%)` for every text — anything less means the
  highlighting will sit dead on some words.
- `entries found` close to the distinct-word count, and most with native audio.
- `titleTranslation` in the generated JSON actually reads as English.

## Verifying UI and behaviour

There is no browser automation dependency, and none is needed: Edge is driven
directly over CDP from throwaway scripts in the scratchpad — launch
`msedge.exe --headless=new --remote-debugging-port=…`, then drive it with Node's
built-in `WebSocket`. These scripts are not committed, so expect to write them
again; they take a few minutes and have repeatedly caught real bugs.

Techniques that have paid off:

- Screenshot a theme by setting `localStorage.theme` and reloading (clear it
  first, or the stored value beats `Emulation.setEmulatedMedia`).
- Assert behaviour instead of eyeballing: stub `window.Audio` to count word
  clips, watch `Network.requestWillBeSent` to prove a click plays from memory,
  read `getBoundingClientRect()` to check a tooltip stays inside its container.
- Drive real hover with `Input.dispatchMouseEvent`; React's `pointerenter` does
  not fire from a synthetic `click()`.

Bugs found this way that source reading missed: a line break falling between a
word and its full stop, the player pushed off screen by a grid row sized to
content, and section cards melting into the page ground in dark themes.

## Attribution

Dictionary content and recordings come from Wiktionary and Wikimedia Commons
under CC BY-SA. The credit currently lives in `README.md`, which covers local
personal use; if this is ever published, the credit belongs in the interface.

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
npm run typecheck        # tsc -b --noEmit
npm run lint             # eslint, type-aware; react-hooks is the point of it
npm test                 # node --test over tests/ — the pure half of the pipeline
npm run content          # regenerate audio + dictionary for changed texts (needs internet)
npm run content:force    # regenerate everything, ignoring the incremental cache
```

**The tests cover the pipeline's pure functions only** — `alignTimings`,
`mp3DurationSec`, the tokenizer, `loadSourceTexts`, `foldGerman`/`slugify`,
`isEcho`. That is not modesty about coverage: those are the functions whose
regressions are *silent*, because nothing throws when a span lands on the wrong
word or a title comes back in German. Anything that talks to the network or to
the DOM is checked the other way, under *Verifying UI and behaviour*. A new
pure function in `scripts/pipeline/` is expected to arrive with its cases.

`loadSourceTexts` takes its directory as a parameter, and `isEcho` is exported,
purely so the tests can reach them; neither is called that way in the build.

**The linter earns its keep on two rules.** `react-hooks/exhaustive-deps` is
the one `useNarration` argues with, and its disable comment there was inert
until there was a linter to disable anything. `react-hooks/set-state-in-effect`
is the one that shapes the code: state that has to be dropped when the text
changes is **derived from the text it belongs to** rather than cleared in an
effect — `App` keeps `{ slug, document }` and `{ slug, token }` together and
compares, `Reader` adjusts while rendering. Reaching for `useEffect` to reset
state is the thing to notice; it also costs a frame of the old text.

`npm run content` is slow the first time a text is built — minutes per text,
not seconds. Wikimedia rate-limits hard, so `scripts/pipeline/http.ts` starts at
one request per host per 350ms and **backs off further for the rest of the run**
once a host answers 429, easing back only while it keeps saying yes. Run it in
the background and keep working; watch the log rather than waiting on it.
Reruns are cheap because dictionary responses and word recordings land in
`.cache/` — narration does not, so anything that invalidates the source hash
pays for `VOICES.length` fresh syntheses per text.

**Kill a build properly.** Stopping the shell that launched it leaves the `tsx`
process running: it keeps writing, and — because it holds the whole
`build-state.json` in memory from before — it will happily overwrite hashes a
later build wrote. A run that mysteriously rebuilds unchanged texts is the
symptom. Check for a stray `node` process before blaming the incremental logic.

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

Every text is narrated once per voice (`shared/voices.ts`), so a build does
`VOICES.length` syntheses per text. The words are shared; the timings are not.
**Adding a voice** is one entry in that file plus a rerun — the picker, the
sidebar's durations and the pipeline all read the same list, and the ids are in
the source hash so the rerun is not optional. Read its own `aligned` line
before trusting it. Reordering the roster is free: the hash is taken over the
sorted ids, because which voices exist matters and their order in the picker
does not.

Each voice also records one short clip introducing itself
(`public/media/voices/<id>.mp3`), which is what the picker auditions. It is
rebuilt only when its `sample` text changes, tracked in `build-state.json`
beside the source hashes.

Things that are easy to break:

- **Timings belong to a voice, not to a word.** `WordToken` carries no
  `start`/`end`; each `NarrationTrack` holds a `spans` table keyed by word id
  *and* sentence id. Nothing may reintroduce a timing onto the token — that is
  the field that made a second voice impossible. `alignTimings` is pure for the
  same reason: it is called once per voice on the same `Sentence[]`, so it must
  not touch them.
- **Narration order is the contract for alignment.** `alignTimings` takes one
  flat `Sentence[]` that must be in the order the engine speaks it — title
  first, then body — because it walks tokens and TTS boundaries together with a
  shared cursor. Anything added to the narration text must also be added to
  that list, in the same position.
- **Boundaries are not one-to-one with tokens.** The engine sometimes reports
  two words in one event (`"Die Straße"`) and sometimes skips a token, so a
  boundary is consumed piece by piece and the aligner resynchronises within a
  small lookahead window. **A token that finds nothing in that window puts the
  cursor back** where it started: the boundaries it scanned past belong to the
  words after it, and consuming them turned one skipped word into a run of
  them. Resynchronisation is the job of the *next successful* match, not of the
  failure. Word timings are what drives highlighting, so a
  regression here is silent — watch the `aligned N/M` line in the build log; it
  should stay at 100%. There is now one such line **per voice**, and they do
  not stand or fall together: the older non-multilingual voices report
  boundaries differently from the multilingual ones, so a new voice has to be
  read on its own line.
- **A narration's length is the length of its file.** `durationSec` used to be
  the end of the last word boundary, which is short by the silence the encoder
  leaves at the end — 0.4s for the multilingual voices, 1.1s for Conrad. The
  sidebar and the player then disagreed by a second. `mp3DurationSec`
  (`scripts/pipeline/mp3.ts`) counts frame headers instead and agrees with what
  the browser reports to the millisecond.
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
  costs a few minutes — that is the intended trade. Editing the voice roster
  needs no bump: the ids are in the hash too.

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

- **Only the index is a fatal error.** Without it there is no list and no
  route, so it keeps the full-window "Nothing to read yet" screen. A single
  text failing to load is reported *in the reader's place* with a Try again
  button, because the list, the settings and any narration already playing are
  all still good — replacing the window over one bad fetch threw away a working
  session. A failed reading is reported the same way, in the scrubber's place
  (`useNarration` listens for the element's `error`); before that, an
  unreachable mp3 left every control disabled and silent about why. Both
  failures are remembered **against the attempt that produced them**, so asking
  again clears them without anything being reset by hand.
- **The text being read is the URL, not state.** `useSlugRoute` keeps it in
  the hash (`#/der-erste-schnee`), so a text can be linked to and Back means
  something. A hash and not a path because the site is static: a path route
  needs a server that rewrites unknown paths to `index.html`, which a project
  page or a bucket will not do, and the hash survives a base prefix for free.
  The only state is what the hash says — *which text that is* is derived, since
  a slug is not a text until the index says so, and a hash naming nothing is
  **replaced** rather than pushed so Back cannot return to a bad address.
- **Nothing hands a path from the data to `fetch` or `new Audio`.** The
  pipeline writes site-root-relative paths (`/media/words/…`) because at build
  time it cannot know where the site will be served from; `assetUrl`
  (`src/lib/assets.ts`) is what turns one into a URL, against Vite's
  `BASE_URL`. Under a prefix — a project page, a preview deploy, a proxy — a
  leading slash points at the host root and every request 404s, silently in the
  case of a word recording. `vite.config.ts` takes the prefix from `BASE_PATH`,
  so a subpath build is `BASE_PATH=/texts-in-german/ npm run build`. Clips stay
  *keyed* by the raw path; only the request is resolved.

- **Switching voice carries the position by word, not by time.** Second 40 of
  Seraphina is a different word than second 40 of Florian, so `useNarration`
  remembers the active *word id* in its teardown and, once the new file has its
  metadata, seeks to that word's start in the new voice and resumes if it was
  playing. The anchor is only honoured when the slug is unchanged — switching
  text starts at the beginning, and its word ids would mean nothing in another
  document anyway.
- **`seek` never changes play state.** Clicking a word and the restart button
  both rely on this: playing stays playing from the new position, paused stays
  paused. Do not "helpfully" call `play()` in either path. The word panel's
  "Read from here" is the one deliberate exception — it seeks *and* calls
  `play()`, because asking to be read from a word is asking to hear it.
- **Clicking a word plays its recording only while the narration is paused**,
  otherwise the clip would talk over the sentence. Two sidebar toggles gate the
  click independently — "Say word" (speak it) and "Jump to word" (move the
  playhead); both live in `useToggleSetting` and persist.
- **The dropdowns are one component.** `SettingPicker` owns the control, the
  outside-click and Escape handling, and the menu that opens *upwards* — these
  controls sit at the bottom of the window. Theme (sidebar, a labelled pill,
  opens on click) and voice (player, a round icon, opens on hover) differ only
  in the props they hand it; a third setting should not grow a third popover.
  Which side the menu hangs from is measured, not declared: it flips to the
  control's right edge when the left one would push it out of the nearest
  `[data-popover-boundary]`. Tooltips use the same marker, so reordering the
  settings cannot clip anything. The gap above the control is *padding on the
  anchor*, not a margin — in hover mode it is the bridge the pointer crosses,
  exactly as in `VolumeControl`.
- **The player bar sets `overflow: visible`**, against `.island`, because the
  voice menu opens out of it; nothing else in the bar overflows. It also sets
  `--popover-ring: transparent`: the sidebar's menus cut a ring of their own
  ground out of the settings they cover, but this one opens over the reader,
  where that band would only be a halo.
- **A voice can be heard before it is chosen.** Each option carries a preview
  button, which is why an option is a `<div role="option">` rather than a
  button — a button cannot contain one. It plays through `clipAudio`, the same
  Web Audio path as the word recordings, so the volume setting reaches it; the
  four clips are prefetched when the picker mounts.
- **Word recordings go through the Web Audio API** (`src/lib/clipAudio.ts`),
  not `new Audio()`. They are volunteer contributions varying ~7x in loudness
  with ~0.5s of silence before the word, so each is decoded up front, scaled
  towards a common loudness and started at the first real sound. The prefetch
  is also what makes a click instant — playing must not trigger a fetch.
  `TARGET_RMS` is measured **over the stretch that is played**, not the whole
  file: taking it over the file let that half-second of silence drag the
  average down, and every clip came out louder than the target by however much
  silence it carried — which is why words used to jump out over the narration.
  Its value is set so the two paths measure the same: K-weighted (BS.1770, the
  LUFS weighting), a clip and the narration land within 0.03 LU of each other.
  Plain RMS is not enough to tune this by — it called them level while they
  were still 0.6 LU apart. **Chrome is the reference**; Firefox plays the same
  numbers at audibly different levels, so calibrate there and check elsewhere.
  `MIN_GAIN` caps how far a clip can be turned *down*, so it imposes a ceiling
  of `TARGET_RMS / MIN_GAIN`; these recordings reach 0.196 RMS, and a floor set
  too high leaves the loudest of them stranded above the target.
- **Playback rises from silence over 40ms when it starts mid-text**
  (`FADE_MS` in `useNarration`). Words are not separated by silence — in these
  narrations the 40ms before a word's start is on median as loud as the word
  itself — so a jump to a word boundary always catches a little of the word
  before. The ramp turns that into an attack. It is *not* a timing correction:
  word timings stay exactly as the engine reported them. The ramp runs on
  play, on resume, and on a seek that passes `{ fade: true }` while playing —
  the scrubber deliberately does not, or a drag would duck the volume on every
  event.
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

`--level-a1` … `--level-c2` are the CEFR badges, one hue each so the sidebar
can be scanned by colour, plus `--level-contrast` for the letters printed on
them. They are a *scale*, not six unrelated colours: green → teal → blue →
violet → amber → red in every theme but Paper, which walks olive → moss → gold
→ orange → brick → wine because it has no blue to spend. The light themes carry
the scale in dark fills under a white label; the dark themes invert it, since a
saturated disc on a dark ground goes muddy. Each fill has to clear
`--level-contrast` by 4.5:1 — the label is the text — so a new theme's six
belong in the ratio script before they are believed.

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

**`html { font-size: 90% }` is the one scale knob**, and it only works because
every size in the app is in rem — the type scale, gaps, paddings, column
widths, control heights, radii alike. It shrinks the interface exactly as the
browser's own 90% zoom does, while staying a *percentage* of whatever default
the reader has set rather than overriding it. Sizes therefore land on
fractional pixels (`--fs-reading` renders at 20.16px), which is normal and what
zoom does anyway; do not "fix" that by writing px, and do not restate the 0.9
in the token values. Anything new belongs in rem too — a px length is for
hairlines and shadows only.

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
| `rate`  | `-10%`                              | Speaking rate, applied to every voice |

There is no `voice:` key: the voice is the reader's setting, not the text's, so
every text is narrated by all of `shared/voices.ts`.

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

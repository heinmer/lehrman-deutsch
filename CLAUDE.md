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

**And do not truncate its output in PowerShell.** `npm run content | Select-Object
-First 12` does not shorten the log, it *stops the build*: `-First` tears the
pipeline down once it has what it asked for, and the build died between copying
the images and writing `index.json`, which then described the previous run.
`Tee-Object -Variable out | Out-Null` and print `$out` afterwards, or let it run
in the background and read the log.

## Architecture

Two halves that meet at one JSON contract, `shared/types.ts`:

- **Build time** (`scripts/`) — reads Markdown from `content/texts/` and header
  illustrations from `content/images/`, hits the network, writes
  `public/data/*.json` and `public/media/**`.
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
- **Narration order is the contract for alignment**, and it is assembled in one
  place: `narrationOrder` in `shared/narration.ts`. `alignTimings` takes one
  flat `Sentence[]` that must be in the order the engine speaks it — title
  first, then body — because it walks tokens and TTS boundaries together with a
  shared cursor. The build assembles that list to synthesize and align, and the
  app assembles it again to know which word is being spoken; they were two
  copies of one rule, which is a bug waiting for the day something new gets
  narrated. Anything added to the narration text goes in that function, in the
  position it is read.
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
- **The files the app downloads are written without indentation.** Indentation
  more than doubled them — 1690 bytes per word against 780 — and nothing reads
  them by eye. `writeJson` takes `{ pretty: false }` for those; `.cache/`
  bookkeeping stays indented, since a person debugging an incremental build
  does read it. Because *how* a file is written is not part of the source
  hash, the skip path rewrites an unchanged document rather than leaving it in
  whatever shape it was last built in — otherwise a format change reaches a
  text only when its content next happens to change.
- **`titleTranslation` is printed in the build log**, which is where to check
  it now that the documents are one long line. It is still the translation
  most likely to degrade quietly.
- **Only definitive answers get cached.** A rate-limited lookup must never be
  written to `.cache/` as "no such word" — that silently drops common words
  from the dictionary. Only 200s and 404s are cached.
- **The build removes what no source accounts for.** Deleting a Markdown file
  used to leave its JSON, its narrations and its hash behind for good — the
  index stopped listing it, so nothing looked wrong while `dist` carried a text
  that no longer exists. `pruneRemovedTexts` now sweeps documents, narration
  directories, state entries and any word recording no surviving document names
  (they are shared, so that last one is a reference count, not a per-text
  delete).
- **A slug is never taken at its word.** It names a file under `public/` and a
  segment of a URL, so `slug:` from front matter goes through `slugify` like
  everything else, and two texts landing on the same slug is an error rather
  than a silent overwrite. `image:` is the same kind of name and gets the same
  treatment — `path.basename`, so it cannot climb out of `content/images/`.
- **A picture is not made here, so it is not in the hash.** The header
  illustration is the one thing a text carries that is neither synthesized nor
  fetched: `copyImages` copies it across before the texts are built, and its
  path lands in the *index* (`TextSummary.image`) rather than in the document.
  Both halves of that are on purpose. In the document it would be part of the
  source hash, and swapping a picture — or giving a finished text its first one
  — would re-narrate the text in every voice for nothing; the index is rewritten
  on every run regardless, so the skip path picks the picture up from the
  *source* and not from the document it just skipped. The app therefore reads
  the image from the summary beside the document, which is why `App` looks it
  up by slug and hands it to `Reader` as a prop.
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
  session. A failed reading is reported the same way, in place of the scrubber
  it explains (`useNarration` listens for the element's `error`); before that,
  an unreachable mp3 left every control disabled and silent about why. It takes
  a **whole row** of the bar rather than a slot between the controls — they are
  all fixed widths and only it gave, so the sentence came out as "This rea…" at
  every width there is. That is what `data-failed` on the bar is for: a child
  cannot ask its parent to wrap, and above the phone breakpoint the bar does
  not. Both
  failures are remembered **against the attempt that produced them**, so asking
  again clears them without anything being reset by hand.
- **The spinner is late and slow to leave.** A text is one small JSON file, so
  switching normally finishes in tens of milliseconds and a spinner shown for
  those reads as something twitching rather than as something loading.
  `useDelayedFlag` therefore waits 400ms before raising it — locally it is
  never seen at all — and then holds it 300ms. The **whole loading state** is
  what is held (`!text || showSpinner` in `Reader`), not the icon inside it:
  gating only the icon looked right and did nothing, because a text arriving
  20ms after the spinner replaced the box the spinner lived in and the minimum
  never bound. The reader therefore waits up to 300ms for a text it already
  has, which is the deliberate half of the trade. Measured, not eyeballed:
  throttle the fetch past 400ms and watch a `MutationObserver` on
  `[role="status"] svg` — the numbers are the only way to tell the two
  implementations apart. Its box stays in the DOM either way, since it is what
  fills the section above the player and a short wait is not a reason for the
  bar to jump.
- **The build writes a `.br` and a `.gz` beside every compressible file.**
  They are inert unless the host is told to prefer them (`brotli_static` /
  `gzip_static` and friends); where it is, the generated data goes from about
  780 bytes per word to 160. mp3 is deliberately skipped — it is already
  compressed, and squeezing it again costs build time for nothing. The app
  never knows: it asks for the same URLs either way.
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
  so a subpath build is `BASE_PATH=/lehrman-deutsch/ npm run build`. Clips stay
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
  click independently — "Say word" (speak it) and "Jump" (move the
  playhead); both live in `useToggleSetting` and persist. Each toggle draws a
  lucide pair, the plain icon against its `*Off` twin, because the recolouring
  alone reads as "hovered" rather than as "off" — which is why "Say word" is a
  speech bubble and not a megaphone: `MegaphoneOff` is too busy at 19px for
  its slash to register.
- **Space is the player's, and nothing keeps it by sitting in the focus.** A
  window listener in `App` toggles playback on it. It yields in four cases: a
  chord it does not claim (Shift+Space is a page up, and the rest belong to the
  browser), the
  info window being open, an event whose default was already prevented, and a
  focused element that is typed into — `ownsSpace` (`src/lib/keys.ts`): a
  contenteditable, a textarea, a select, and every `<input>` but a range,
  which ignores Space and answers to the arrows. **Buttons are deliberately
  not on that list.** Exempting them was the first attempt and it is what the
  reader notices as broken: a button keeps the focus after being clicked, so
  Space after changing the theme re-opened the theme menu and Space after
  closing the info window re-opened the window. Telling a clicked button from
  a tabbed-to one is what `:focus-visible` is for, and it **cannot be read
  inside a keydown handler** — pressing a key is itself what makes the focused
  element focus-visible, so it is already true when the handler runs. That was
  tried, and it changed nothing; do not reach for it again. A button is
  reached from the keyboard with Enter instead, which every button here
  answers to. Two things follow. The handler `preventDefault`s, which
  suppresses the focused button's own activation as well as the page scroll —
  without it Space would both play and press. And a component that wants Space
  says so the ordinary way, by calling `preventDefault` itself: that is how
  the pickers' `role="option"` divs keep it, and React's listeners sit on the
  root container, so their handlers have run by the time the window's does.
  **A word in the reader therefore answers to Enter and not to Space**, though
  a `role="button"` would normally take both — worth paying, since the focus
  after clicking a word *is* that word.
- **Ctrl+Space is the one chord that handler claims**, and it reads the text
  from the top: `seek(0)` and `play()`, which is Ctrl+Alt+click made of the
  whole text rather than of a word. It plays from a standstill for the same
  reason that one does — asking to be read the text is asking to hear it — and
  the restart button is deliberately *not* this, since seeking never changes
  play state. It opens nothing: the first word is not selected, so the panel
  keeps whatever is in it. **Ctrl and not Cmd**, unlike the modifiers on a
  word: Cmd+Space is Spotlight and never reaches a page, so a Mac keeps the
  same key as everywhere else — which is why `HelpDialog` prints `⌃` there and
  `⌘` in the rows below it. Alt is *excluded* rather than merely unread,
  because AltGr reports itself as Ctrl+Alt and on a German layout the right Alt
  is AltGr. The two conflicts it does have are the OS's and out of reach:
  macOS switches input source on it by default, as does a Windows CJK IME.
- **The modifiers on a word replace the settings rather than adjusting them.**
  Ctrl+click opens the word and touches nothing else; Alt+click speaks it and
  touches nothing else; Ctrl+Alt+click reads the text *from* it, starting
  playback even from a standstill. All three ignore "Say word" and "Jump"
  entirely, which is the point: each behaviour is one click away whatever the
  settings are. Alt+click is also the one path that speaks a word **over a
  running narration** — the setting is held back there precisely so it does
  not, and asking explicitly is the way to overrule that. Cmd counts as Ctrl
  because on a Mac Ctrl+click *is* the context menu. Shift is deliberately
  unused — it is how a browser extends a text selection, and the words are
  ordinary inline text. **AltGr is one key that reports itself as Ctrl+Alt**,
  and on a German layout — hardly a far-fetched keyboard here — the right Alt
  *is* AltGr, so `wordAction` reads `getModifierState("AltGraph")` first and
  treats it as the one modifier it is; without that, reaching for Alt+click
  with the right hand would read the text instead of speaking the word.
  The mapping is one pure function, `wordAction` (`src/lib/wordAction.ts`),
  and the click and the Enter path both go through it, so a shortcut is never
  something only a mouse can reach. `App`'s `selectWord` is the one place the
  four outcomes live; its Ctrl+Alt branch is `readFrom`, which is also what
  the panel's "Read from here" calls, so the two cannot drift apart.
- **The info window is the only modal.** `HelpDialog`, opened from the `i`
  beside the site's name, is a centred card over a scrim at z-index 60 — in
  front of both drawers, and Escape reads that same order in `App` (info, then
  drawer, then panel). It focuses itself on open, hands focus back to whatever
  opened it, and wraps Tab at both ends, because the page behind it is still
  in the tab order. Its focus ring is turned off: the card is only a landing
  place for the keyboard, and the global outline drawn round the whole window
  reads as a border. It is titled for the site and not for its contents, so
  that the next thing to go in it is a section under its own heading rather
  than a second window; today there are three. *What is Lehrman-Deutsch?* comes
  first and says what the site is, then *Settings* and *Shortcuts*. **All three
  are the same shape** — a heading, a note under it, and a table where there is
  one to show. The first is only the first two of those, which is the whole
  reason it does not need a treatment of its own: a lead paragraph set larger
  and darker was tried and it made the opening a different kind of thing from
  the sections under it, when what it is is the first of them. Its note is one
  paragraph of two sentences — what the site is, then the one move the whole
  thing turns on — and it does not want a third: a note long enough to have to
  be read before the tables are reached is no longer a note. It says "This is"
  rather than naming the site the heading has just named.
  `.note:last-child` drops the margin that would otherwise stand before a
  table, so a section that is all note sits level between the rules either side
  of it. **The settings come before the shortcuts**, because they
  are what a plain click does and the modifiers read as the exceptions to them
  — which is the one thing about those four shortcuts a reader cannot work out
  by trying them.
- **Its tables are drawn as tables**, in `HelpDialog.module.css`: a rounded box
  with an outline, one fill, and a rule between the two columns as well as
  between every pair of rows. They were a hairline between rows and nothing
  else, which left what the two columns *are* to be worked out from the ragged
  edge of the left one. Four things hold it together and each was arrived at
  the hard way:
  - **It is drawn in tints, not in the tokens at full strength.** `--track` is
    the weight of a scrubber's groove; an outline round every cell in it turned
    six sentences into a form. `--help-line` and `--help-stripe` are
    `color-mix`ed from `--track` and `--surface-inset` on `.rows`, because what
    is wanted is a *fraction* of a colour each theme has already chosen — a
    per-theme token would be four hand-picked values to keep in step with the
    two they come from.
  - **The fill is under half a pour of `--surface-inset`.** A table is set
    *into* the page rather than lifted off it, and inset is the only step there
    is on this ground anyway: `--surface-raised` and `--surface-overlay` are
    both the card's own colour in three themes of four. What the fraction has
    to stay is **translucent**, since it is a wash over the card: that is what
    keeps the `kbd` chips visible, they being inset at full strength and so
    compounding to a step above whatever is under them. The rows were banded
    between this and the full pour for a while and it was one stripe too many —
    the rules already say where a row ends, and a ground changing under every
    other one made the table busier than the six sentences in it.
  - **The cells stretch; the rules are borders on them.** The column rule is a
    `border-right` on the left cell, so that cell has to reach the row's full
    height — baseline-aligned it drew the line a third of the way down. The key
    is then centred down its row with `align-content`, which needs
    `flex-wrap: wrap` to have any effect at all; `align-items` still sets the
    chips of a chord on one baseline. Below 30rem the row stacks and that
    border has to turn with it, or it hangs down the middle of a cell with
    nothing to its right.
  - **The left column is sized to the longest chord *plus the cell padding*.**
    10.5rem was right while the column was bare and broke `Ctrl+Alt+click` over
    two lines the moment the cells were given padding. Assert it rather than
    counting characters — and not by comparing the children's `offsetTop`,
    which differs on one line too because they are baseline-aligned, nor
    against the cell's height, which `align-content` fills. Two items on one
    line overlap vertically; two on different lines cannot.
- **The rule between the sections stays inside the body.** It is level with the
  sides of the tables it divides and keeps `--track` at full strength, so the
  section division is the larger of the two by *weight* while the lines inside
  a table are a softer pour. It ran out to the card's edges once, which is why
  `.body` had a `--help-inset` to hand back with a negative margin; that was to
  tell it from the hairlines within a table, and a table that is now a bordered
  box of its own leaves nothing to confuse it with. The rule under the title is
  the one that still reaches the edges — it divides the window's head from its
  body, which is not a division of the same kind. The headings went up a step
  to `--fs-md` along the way, because at the size of the descriptions their
  caps and their colour were doing all the work.
  The cross hovers onto `--surface-inset` and not onto `--surface-raised` as the word
  panel's does: the panel's ground is the page, while this card floats on
  `--surface-overlay`, and in every theme those two are **the same colour** —
  the button lit up into exactly what was already under it. Anything sitting
  on a floating ground has the same problem and the same answer, which is what
  the pickers' options hover onto. **Its lines are `--track`, not `--border`**:
  on Paper's and White's card grounds `--border` is the fainter of the two —
  1.1:1 and 1.2:1 against them, which is invisible — so it is `--track` that
  every line here is a full or a fractional pour of. Measure a line against the
  ground it is drawn on, as with everything else here.
- **The info window has a ground of its own, `--surface-dialog`.** In three
  themes it is the same value as `--surface-overlay`; in Ink it is the *page*,
  because that light navy is a step a menu of four options wants and a window
  of prose cannot carry — a card's worth of text sat too close to it to read.
  The scrim is what tells the card from the page it matches. It is a separate
  token and not a change to the overlay because the pickers, the volume slider
  and the drawer island all float on that one and are right as they are.
  Its notes are `--text-muted` at `--fs-sm`, the descriptions' own size and
  colour: `--text-soft` measured 3.4:1 in Paper and 4.0:1 in White, which is a
  caption's contrast, and a note the tables depend on is not a caption. Its
  place under the heading is what marks it as a note.
- **"Show image" removes the picture, it does not hide it.** The third
  `useToggleSetting`, and the only one that is about the page rather than about
  a click: with it off `App` passes `image={null}` and no `<img>` is rendered,
  so a reader who does not want the illustration does not download it either —
  `display: none` would have cost them the file anyway.
- **Nothing in the settings footer is pinned to a line.** It is one wrapping
  flex row and the controls fill it in source order, so the same five settings
  come out as three lines beside a 300px sidebar and five beside a 243px one.
  The two toggles that have a paired *Off* icon — and the volume button, which
  is round — used to be held in rows so a particular grouping survived; that
  made the footer answer to a width someone measured once rather than to its
  own. Adding a setting is one more child in the position it belongs, and the
  wrapping is the layout's problem. Verify by sweeping widths and reading the
  rows out of `getBoundingClientRect()`, not by looking at one screen.
- **The dropdowns are one component.** `SettingPicker` owns the control, the
  outside-click and Escape handling, and the menu that opens *upwards* — these
  controls sit at the bottom of the window. Theme (sidebar, a labelled pill,
  opens on click) and voice (player, a round icon, opens on hover) differ only
  in the props they hand it; a third setting should not grow a third popover.
  Which side the menu hangs from is measured, not declared: it flips to the
  control's right edge when the left one would push it out of the nearest
  `[data-popover-boundary]`, so reordering the settings cannot clip a menu.
  `edge="boundary"` measures two more distances against that same box and
  hands them to the CSS as `--popover-shift` and `--popover-lift`: the menu is
  then placed against the *box's* side and top edges rather than the control's,
  which is what the voice picker wants — it is the last thing in the bar, and
  hung off the disc the menu stopped a padding short of the bar's right edge
  and came to rest on its top one. A control's inset from its host is the
  host's padding, so it is not something this component can be told in CSS.
  The gap above is *padding on the anchor*, not a margin — in hover
  mode it is the bridge the pointer crosses. (The volume control needs no such
  bridge: it is one box that grows rather than a card opened above a disc.)
  `size="large"` is the voice list, which is read from across the reader; the
  sidebar's menus stay the size of the footer they belong to, so the two sizes
  are a prop and not a change to the component. **A menu in the sidebar washes
  the settings it covers out around itself** — `--popover-ring` is the width of
  that band, `--popover-veil` how much of the ground it carries and
  `--popover-ground` which ground that is — wrapped round the whole box, since a
  menu is in the middle of a list and not at an edge of the layout. It is a
  **band with an edge**, a hard-edged shadow and not a fade: the menu's own rim
  then stands on a strip of the page rather than on whatever happened to be
  behind it. It was a soft gradient once and read as a smudge round the box.
  Thin, and translucent so that what is under it stays legible as something
  covered — over the plain ground, where it has nothing to cover, it is
  invisible by construction, being that ground's own colour.
  It is a shadow cast in that ground rather than a colour
  of its own, on a pseudo-element behind the menu: `--shadow-card` is `none` in
  every theme, and `none` in a list of shadows invalidates the declaration. The
  player passes `transparent` and its menu has nothing drawn round it at all.
  A hover menu closes the moment the pointer leaves the root. That makes the
  travel between the control and the menu a real one — a disc is much narrower
  than its menu, so a pointer cutting the corner leaves sideways, across ground
  that belongs to neither, and the list has to be reached by going up first.
  A grace period before closing fixes that and was tried; it was not wanted,
  the menu reading as slow to let go. Widening the bridge is not an
  alternative: that dead ground is the bar's own row, and an anchor reaching
  down over it would swallow the clicks meant for the speed strip.
  The list answers to Up/Down/Home/End and, when it was opened by click rather
  than by hover, takes focus to the chosen option — in hover mode it must not,
  or the pointer arriving would steal focus from wherever it was.
- **Below 62rem the sidebar becomes a drawer, not nothing.** It used to be
  `display: none`, which took the text list, the theme, the volume and both
  toggles away with it and left a phone showing one text it could not leave.
  It is now a fixed panel opened from a round island in the reader's bottom
  corner — closed by choosing a text, by Escape or by the scrim, and
  `visibility: hidden` while shut so it is not somewhere the tab key can go.
  That island is a child of the player bar (`.library`, absolutely positioned
  against it) only because the bar is the one thing whose top edge is where it
  has to hang; it is not a control in the row, which at this width is already
  wrapping. It lines up with the bar's left edge — and so with the text column
  — and stands `--gap` above it. The stray pixel in each offset is the bar's
  border: offsets resolve against its padding box, one border inside the edges
  being measured from. Its ground is `--surface-overlay` at 62% behind a
  `backdrop-filter` blur — the one floating thing that is not opaque, and the
  blur is what stands in for it. Below 48rem the word panel becomes a drawer in exactly the same
  way — its own wrapper, its own scrim, closed by clicking beside it — since a
  third of a phone is not a column the prose can be read in, and a section
  covering the reader should not leave the reader clickable underneath it.
  Both wrappers are `display: contents` above their breakpoint, which is what
  keeps the two sections ordinary grid children while they are in the layout;
  neither is addressed by position in the grid, which is how `:last-child`
  used to find the panel. The drawer's scrim sits *above* the panel (48
  against 45), because the drawer is in front of it and Escape reads the same
  order.
- **The centre is one section, and the player rides inside it.** The reader
  fills `.main` down to the bottom edge, and the bar is the last thing in the
  reader's own flow, `position: sticky` at the bottom of it — which is why
  `Reader` takes it as `children` and renders it in every state, text or no
  text. It is **in the flow and not positioned over it** for one reason: a
  scrollbar that takes layout space, as Chrome's does and Firefox's does not,
  narrows the text column, and only something laid out in that column narrows
  with it. Absolutely positioned against the section, the bar ran under the
  scrollbar on exactly one of the two browsers, and CSS cannot be asked how
  wide that scrollbar is. Everything else follows from being in the flow: the
  reader is a flex column and the article grows (`flex: 1 0 auto`), so a text
  too short to fill the section still pushes the bar to the bottom and nothing
  becomes scrollable; the loading and failure states take `flex: 1` instead of
  a height for the same reason. What holds the bar off the bottom edge is its
  host's own `padding-bottom`, not a sticky offset and not the reader's
  padding — Chrome adds the container's padding to the offset and Firefox does
  not, and a gap carried inside the sticky box is the same in both, stuck or at
  rest. The host also draws the reader's ground from `--player-fade` above it
  down to that edge, fading in over the top: without it a strip of half a line
  shows *below* the bar. And the article keeps `--player-space` under itself so
  that the last line comes to rest clear of the fade. **That fade is the width
  of the section, not of the bar** — everything else in the reader is the width
  of the text column, but the ground being carried down belongs to the whole
  section, and a band stopping at the column's edges left the gutter unfaded on
  both sides. It reaches out by `--reader-gutter`, which is the reader's own
  side padding declared as a property for this one purpose, so it lands exactly
  on the section's padding edge — inside the scrollbar, and with nothing
  overflowing for the reader to scroll sideways to.
- **Every grid track that holds content is explicit.** An implicit track is
  sized to its content: `.main` without `grid-template-columns` let the reader
  grow past its column instead of wrapping inside it — invisible on a wide
  screen, a page that scrolls sideways on a narrow one — exactly as the
  implicit *row* once pushed the player off the bottom, back when the bar was a
  row of that grid. `min-width: 0` on the item does not cover this; it stops
  the item outgrowing the page, not the item's own child outgrowing the item.
- **The player bar measures itself, not the window.** Every control in it is a
  fixed width and only the scrubber gives, so it is the scrubber that pays for
  a narrow bar — down to no track at all, which is what it came to. It takes a
  row of its own below 52rem *of bar*, and the gaps tighten below 38rem, both
  as container queries against `.host`, the box that carries the bar at the end
  of the reader's flow (`container-type: inline-size`) and is exactly as wide
  as it. `.main` is not: the reader's padding and its scrollbar are both
  between them. Against the *window*
  this cannot be got right either: the sidebar leaves the layout at 62rem and
  the word panel at 48rem, so between those steps the window narrows while the
  bar **widens**, and a window breakpoint therefore squeezes the row hardest
  just before each step and lets go just after. The track vanished twice on the
  way down. The thresholds are in rem because what they are weighed against is
  — but note that a `rem` in a container query is the root's font size (90%, so
  52rem is 749px), while a `rem` in a media query is the browser's untouched
  default.
- **On two rows the settings hang from the right edge**, the transport from the
  left: `margin-left: auto` on the speed strip, which carries the rule between
  the two groups as its own left border and so takes it along. The same
  declaration is what lets go on a row too narrow to hold them — an auto margin
  takes only *positive* free space — and the row then packs left to be
  scrolled at.
- **The row scrolls rather than wrapping a second time.** `.trailing` (the time
  and the speed strip) is `display: contents` on a wide bar and a horizontally
  scrolling flex box on a narrow one, so a phone gets two rows and never three.
  What it may **not** hold is the voice picker, whose menu opens upwards out of
  the bar: a scroll container clips on both axes no matter what the other
  one's `overflow` says, and there is no CSS pairing of `auto` with `visible`.
  It stays outside, pinned to the right edge — as do play and restart at the
  other end, which is why neither is ever something to scroll to. The box
  carries `padding-block` with an equal negative `margin-block`: without it the
  clip box cuts the shadows and focus rings off the controls inside.
- **A media query adds no specificity**, and neither does a container query. A
  narrow-screen override of a rule declared *later* in the same file loses on
  source order and does nothing — silently, since both rules are valid.
  Responsive blocks go at the end of the file; `PlayerBar.module.css` has its
  two there for exactly this reason.
- **The player bar sets `overflow: visible`**, against `.island`, because the
  voice menu opens out of it; nothing else in the bar overflows. It also sets
  `--popover-ground: transparent`: the sidebar's menus wash the settings they
  cover out around themselves, but this one opens over the reader, where that
  would only be a band of ground round a box that is already floating.
- **A voice can be heard before it is chosen.** Each option carries a preview
  button, which is why an option is a `<div role="option">` rather than a
  button — a button cannot contain one. It plays through `clipAudio`, the same
  Web Audio path as the word recordings, so the volume setting reaches it; the
  four clips are prefetched when the picker mounts.
- **A text's recordings are not fetched when it opens.** They were, once — all
  of them, which for one A2 text is 165 files and about 3.5 MB, decoded into
  float samples and never released. `clipAudio` now warms **one clip at a
  time**, when the pointer or the focus reaches a word (`onWarmWord`), which is
  early enough that the click still plays from memory; `prepared` is an LRU
  capped at `MAX_DECODED`, and the voice samples are `pinClips`-ed so nothing
  evicts them. `newTextOpened()` bumps a generation so a decode still in flight
  for the text the reader left is finished but not kept. The invariant that
  matters is unchanged — **playing must not trigger a fetch** — it is just
  bought by reaching the word rather than by the whole dictionary.
- **Word recordings go through the Web Audio API** (`src/lib/clipAudio.ts`),
  not `new Audio()`. They are volunteer contributions varying ~7x in loudness
  with ~0.5s of silence before the word, so each is decoded up front, scaled
  towards a common loudness and started at the first real sound. The prefetch
  is also what makes a click instant — playing must not trigger a fetch.
  `TARGET_RMS` is measured **over the stretch that is played**, not the whole
  file: taking it over the file let that half-second of silence drag the
  average down, and every clip came out louder than the target by however much
  silence it carried — which is why words used to jump out over the narration.
  In dev the module puts `decodedClipCount` on `window`; the cache's ceiling is
  otherwise unobservable, and that is what the browser check reads.
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
- **The volume control is one box that grows, not a card above a disc.** The
  disc stands up into a pill carrying the slider over the icon, the way a
  player's volume does. It was a popover once, and every difficulty it had was
  the gap: the hover area had to stay continuous or the slider closed as the
  pointer travelled to it, and the card had to be exactly the button's width
  for the two to read as one control at all. Growing removes both. What holds
  it together: `.root` keeps the disc's place in the footer at
  `--control-height` square and the pill is absolute inside it, so opening
  shifts nothing; `.slot` is the room the slider stands in, zero-height and
  clipped while shut, which is why it carries a little space *under* the track
  as well — the input's focus ring is inside that clip. That slot then **hangs
  down over the top of the disc** once it is open, because the two boxes
  meeting left some 25px of nothing between the track and the icon: the last
  stretch of the slider is the thumb's travel and the top of the button is the
  padding round a 19px icon in a 3rem circle, and neither can be taken away, so
  they overlap instead. The button is lifted above the overhang (`z-index`) so
  the disc keeps its whole click target — it has no ground of its own, so the
  track still shows through it, and what the slider gives up there is the
  couple of percent at the bottom of its travel. The overlap belongs to the
  open state alone: at rest it would take the disc below `--control-height` and
  out of step with the rest of the footer. The pill's ground steps
  from `--surface-inset` to `--surface-overlay` as it opens, because open it
  floats over the text list and only the overlay is guaranteed opaque; its rim
  and the band that clears the settings behind it are drawn on a pseudo-element
  and faded in with it, a disc among its like having neither. The icon is not a
  `.control` — the ground belongs to the pill now, and a disc of its own inside
  it read as a button in a box.
  Keyboard focus holds it open, but `:focus-visible` and not `:focus-within`:
  focus left behind by a drag would pin it open after the pointer had gone.
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
- **The mark and the name are one lockup**, which is what `.brand` in the
  sidebar's header is for. The mark is drawn in `currentColor` and handed
  `--accent`, the same colour the name takes, and set a touch over the name's
  cap height — `0.82` of `--fs-md`, against the `0.72` where DM Sans's
  capitals reach, because level with the L it read as timid. The extra height
  is spent upwards, the baseline being shared. `0.90` is the ceiling: past it
  the mark is taller than the h1's own box and the header stops being the
  height of the `i` button in it. What holds the two
  together is `align-items: baseline` on that wrapper and not a nudge: centred
  on the name's line box the mark sat a pixel low, because a line box carries
  the descender space under the baseline and so its middle is below the middle
  of the cap band. The mark has no baseline of its own, so its bottom edge is
  what lands on the name's, and the numbers then need no maintaining. It has
  to be a **wrapper**: baseline alignment means nothing to a lone item — it
  simply goes to cross-start — and putting the whole header in the group would
  drag the name up to meet the taller `i` button.
  **Centring the overshoot instead was considered and turned down.** Hanging
  the mark half its excess below the line, so that it clears the capitals top
  and bottom, is the right treatment for a mark that reads as an object; this
  one reads as letters — a monogram of the two the name starts with, with a
  flat foot, beside a wordmark that has no descenders — so the foot of its L
  belongs on the line the word's L stands on, and dropped below it the two
  read as misaligned rather than as balanced. It does not come out symmetric
  anyway: DM Sans's nominal cap height is 13.0px against 12.56px of actual
  ink at this size, so an honest centring takes its constant from a
  rasterisation and moves with the size, while a baseline needs no constant
  at all.
- **The favicon is three files and one of them switches colour.**
  `public/favicon.svg` carries a `prefers-color-scheme` rule in an inline
  `<style>`, so it is the White theme's ink on a light interface and the Black
  theme's on a dark one; current Firefox and Chromium honour it, and it is the
  only one of the three that can, a raster having no way to ask. `favicon.ico`
  (16 and 32, PNG payloads) is therefore drawn in an accent halfway between
  the one the light themes use and the one the dark themes use, clearing about
  3.9:1 on a white tab strip and 4.2:1 on a dark one rather than being right
  on one and invisible on the other. `apple-touch-icon.png` is opaque with a
  ground of its own, because iOS puts it on a home screen. All three are
  hand-placed in `public/` — nothing generates them — and Vite rebases their
  `href`s in `index.html` against `base`, so a subpath build needs no help.
  The path in `favicon.svg` is a second copy of the one in `Logo.tsx`;
  redrawing the mark means changing both.
- The word panel's column is always in the grid, so opening it never shifts the
  text.

### Styling

Plain CSS Modules plus custom properties. `src/styles/global.css` holds the
structural tokens (type scale, radii, spacing); `src/styles/themes.css` holds
every colour. Change the token, not the component — no component names a colour
directly, which is what makes new themes cheap.

**Adding a theme** means two places: a full token block in `themes.css` under
`:root[data-theme="<id>"]`, and an entry in `shared/themes.ts` (its two swatch
colours are duplicated there for the picker dot). It used to be three — the
inline script in `index.html` carried its own hand-copied list of ids, and a
theme missing from it worked until the next reload and then silently fell back.
That list is now written in from `shared/themes.ts` by a small Vite plugin, in
place of the `__THEMES__` placeholder. The script runs before the bundle, so it
cannot import; a build step is the only way it and the app can hold one list.

A theme must define *every* token — a missing one is not inherited from another
theme, it simply goes unset and the declaration is dropped, which is silent.
Renaming a token means renaming it in the components too; grep for it.

**Every theme is a single sheet.** White, Black, Ink and Paper are all the
same arrangement: page, sidebar, reader and word panel share one ground, and
nothing is drawn between them — `--island-border: transparent`, `--shadow-card:
none`, `--shadow-raised: none` in all four. The themes that gave each section
its own tint (Midnight, Dusk, Daylight) were removed for that reason; a new
theme is expected to keep the sheet. The three tokens still exist for one that
wants to draw between sections again, but a theme setting them is going against
the grain of the rest.

**The player is the one box those themes do draw.** It keeps a
`--surface-player` a step off the sheet while the sidebar, the reader and the
panel stay flush with the page, because it is a bar of controls rather than a
stretch of the page and, with no border and no shadow to lean on, its ground is
the only thing that can say so. Exactly one tinted box against three flush ones
is the arrangement: giving a second section its own ground puts the seams back
and there is nothing left to tell the controls apart from the prose. The
scrubber thumb's ring is `--surface-player` too, so it follows on its own. It
is also the one ground that has to be **opaque**: the bar floats on the reader
with the prose scrolling under it, and the `--surface-reader` backdrop behind
it is what the text disappears into.

Being a tinted box is also why the controls inside it hover onto
`--surface-player-raised` rather than `--surface-raised`: in every theme but
Ink those two are the same colour, so a disc pointed at dissolved into the bar
exactly as it was being reached for. Each theme sets it as a stronger pour of
the overlay its resting controls are filled with, which is a step from what it
replaces whatever the bar is made of. The bar maps it to `--control-hover`,
which is the knob `.control` reads — a host whose own ground is
`--surface-raised` has to say so, and only the player is one.

`--surface-raised` and `--surface-overlay` are both "a step above the page",
but only the overlay is guaranteed **opaque**. Raised may be a translucent
white — no theme uses that today, but it is allowed — which is fine for
something sitting in the layout and wrong for anything floating over it: the
theme menu and the volume slider both showed the text list through themselves
until they moved to the overlay token. Anything that floats belongs on
`--surface-overlay` — with one exception, `--surface-dialog`, which is the info
window's own ground. Everything else that floats is a handful of controls read
at a glance and wants a step up off the page; that one is a window of prose and
wants a page's contrast, which in Ink is not the same colour at all. A second
box of prose over the page would use it too.

`--scrim` is the ground *behind* the drawer on narrow screens, and it is the
one token whose job is to be seen through: it darkens the reader enough that
the drawer reads as being in front of it. Light themes tint it with their own
ink rather than plain black — Paper's is warm, because a neutral black over
newsprint reads as a hole.

`--surface-selected` is the chosen option inside a segmented strip — today only
the playback speed — and `--selected-contrast` is the colour its label is
printed in. It has to clear `--surface-inset`, the strip *behind* it, which is
a different job from clearing the page: on one sheet "raised" and that strip
land within a hundredth of each other and the selection vanishes. Measure the
chip against the strip, not against the ground.

**The light themes lift that chip towards white and write on it in their
accent; the dark themes turn it round**, as the level badges do — a pale chip
carrying the page's own ink. The two are not a matter of taste. A dark chip
lifted one step off a dark strip cannot be seen at all: Black's stood at 1.01:1
against it, which is to say it *was* the strip, and Ink's at 1.10:1. Lifting it
to the step the light themes have (1.28:1 in White, 1.38:1 in Paper) then leaves
nothing for a pale accent to be read against — Ink's cleared only 4.65:1 before
it moved and 3.66:1 after. So the ground carries the selection there and the
label goes dark: 6.4:1 and 6.8:1 chip against strip, 9:1 label against chip.
The two tokens move together and a change to either alone is not safe. Compose
the strip over the player bar before measuring anything against it — it is
`--surface-inset`, which is translucent in every theme, and taken at its
computed value it reported White's chip at 16:1 against a strip that is in fact
a hair off the bar.

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
theme exists to avoid. Ink is the cool counterpart and follows the usual rule —
one deep navy ground carrying the same blue and green as everything else.

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
image: ein-tag-am-see.png
---

Es ist Sommer. Lena und Tom fahren mit dem Fahrrad zum See.

Nach einer Stunde kommen sie am See an.
```

| Key     | Default                             | Notes                              |
| ------- | ----------------------------------- | ---------------------------------- |
| `title` | file name                           | Narrated first, then the body      |
| `level` | `A1`                                | Sorts the sidebar; shown on a badge |
| `order` | —                                   | Place within the level; see below  |
| `topic` | —                                   | Stored but not displayed anywhere  |
| `slug`  | file name                           | Output file and URL identifier     |
| `rate`  | `-10%`                              | Speaking rate, applied to every voice |
| `image` | —                                   | Header illustration in `content/images/` |

There is no `voice:` key: the voice is the reader's setting, not the text's, so
every text is narrated by all of `shared/voices.ts`.

`image:` is a bare file name in `content/images/`, which is the one directory
of source material that is *not* generated — the build copies what is named
into `public/media/images/` and deletes what nothing names. Several texts may
share one picture, so the copies are keyed by file name and not by slug. It is
not in the source hash and not in the document (see the pipeline notes), so
adding or swapping one is a rerun of seconds rather than of narrations.

**Pictures go in as WebP, about 1600px wide.** The build copies whatever it is
given, so the discipline is here rather than in the code: the header is drawn
at most 689 CSS px, which is ~1378 device pixels on a 2× screen, and anything
larger is downloaded to be thrown away. The first illustration arrived as a
2.5 MB PNG — several times the whole rest of the site — and came out at 141 KB
without a visible difference (SSIM 0.976 against the same downscale losslessly
encoded; the two are indistinguishable side by side at 1:1). ffmpeg does it:

```bash
ffmpeg -i in.png -vf "scale=1600:-2:flags=lanczos" -c:v libwebp -quality 85 out.webp
```

**The sidebar reads as a course, and `order:` is what writes it.** Texts sort
by level first — easiest to hardest, by position in `LEVELS` and not by how the
labels happen to spell — and within a level by `order:`, lowest first. The
texts of one level build on each other in a sequence only the author knows, so
the alphabet is not it; file names never were.

A text carrying no `order:` falls to the *end* of its level, alphabetically
among its like. That is on purpose: an unplaced text must not land in the
middle of a sequence that was placed. Numbering runs 1, 2, 3 per level and
starts over at each one — inserting in the middle means renumbering what
follows, which for a handful of texts is cheaper than reading gapped numbers
forever. `order:` is not in the source hash and not in the document, so
reshuffling the whole course is a rerun of seconds: only `index.json` changes.

The sort lives in `byCourseOrder` (`scripts/pipeline/source.ts`) and is applied
to the *sources*, once, before anything is built. Summaries are pushed one per
source, so that order is the index's order and therefore the sidebar's — and
the build log then reads in the same order the reader sees. Do not add a second
sort over the summaries at the end; there was one, and it was a second place to
keep in step.

**Write real German.** These are teaching texts: keep A1 to present tense and
simple clauses, and let A2 use Perfekt, subordinate clauses with `dass`/`weil`,
modals and separable verbs. Grammar errors here become errors the learner
memorises with audio attached.

**After the build, check the log rather than assuming:**

- `aligned N/M words (100%)` for every text — anything less means the
  highlighting will sit dead on some words.
- `entries found` close to the distinct-word count, and most with native audio.
- the `title: "…" -> "…"` line actually reads as English.

## Verifying UI and behaviour

There is no browser automation dependency, and none is needed: Edge is driven
directly over CDP from throwaway scripts in the scratchpad — launch
`msedge.exe --headless=new --remote-debugging-port=…`, then drive it with Node's
built-in `WebSocket`. These scripts are not committed, so expect to write them
again; they take a few minutes and have repeatedly caught real bugs.

Techniques that have paid off:

- Screenshot a theme by setting `localStorage.theme` and reloading (clear it
  first, or the stored value beats `Emulation.setEmulatedMedia`).
- Assert behaviour instead of eyeballing: watch `Network.requestWillBeSent` to
  prove a click plays from memory and that opening a text fetches no
  recordings, read `getBoundingClientRect()` to check nothing leaves its
  container, compare `document.documentElement.scrollWidth` against
  `innerWidth` to catch a page that scrolls sideways.
- Force the failure you want to see: `Network.setBlockedURLs` with
  `*/data/texts/*` or `*/media/texts/*` is how the error paths are checked.
- `Emulation.setDeviceMetricsOverride` for the narrow layouts — the drawer and
  the panel are only reachable below their breakpoints.
- Drive real hover with `Input.dispatchMouseEvent`; React's `pointerenter` does
  not fire from a synthetic `click()`. Same for keys: `Input.dispatchKeyEvent`
  is what exercises the roving tabindex.
- **Reload with `Page.reload`, not by navigating to where the page already is.**
  A `Page.navigate` to the current URL keeps the document — and with it the
  state a reload was supposed to clear — so "the setting survives a reload"
  passes without ever having been tested. Same trap one step earlier: a hash
  change alone does not re-run the inline theme script in `index.html`.
- **Ask the page what it loaded, not the CDP listener.**
  `performance.getEntriesByType("resource")` is what the document actually
  fetched, memory-cache hits included and nothing to race;
  `Network.requestWillBeSent` misses a memory-cache hit entirely and drops
  everything that happened before the listener was attached. "Nothing was
  downloaded" is worth nothing as an assertion if the events were never
  arriving in the first place.
- **Kill the browser properly, and check that it died.** `child.kill()` leaves
  Edge's helper processes holding the debugging port, and the next run attaches
  to a browser whose profile has been deleted underneath it and hangs. Use
  `taskkill /T /F`, and give each run its own port. `/T` is not enough on its
  own either — Edge's children outlive the process that spawned them, and
  seventeen runs left 161 processes and 9.9 GB of profiles in `%TEMP%`. Sweep
  by profile at the end of a session, which cannot touch a real browser:

  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object { $_.CommandLine -like "*edge-cdp-*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-ChildItem $env:TEMP -Directory -Filter "edge-cdp-*" | Remove-Item -Recurse -Force
  ```

Bugs found this way that source reading missed: a line break falling between a
word and its full stop, the player pushed off screen by a grid row sized to
content, section cards melting into the page ground in dark themes, and the
reader outgrowing its column on a narrow screen because `.main` had no explicit
column.

## Attribution

Dictionary content and recordings come from Wiktionary and Wikimedia Commons
under CC BY-SA. The credit currently lives in `README.md`, which covers local
personal use; if this is ever published, the credit belongs in the interface.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.png">
    <img src="brand/logo-light.png" alt="Lehrman-Deutsch" width="96">
  </picture>
</p>

# Lehrman-Deutsch

A reading trainer for German: short texts, narrated end to end, with every word
clickable for pronunciation, IPA, part of speech and English meaning.

The audio and the dictionary are generated once, ahead of time. What is served
is static files and nothing else — the app calls no service, at build or at
run time, so it works from a folder as readily as from a host.

## Quick start

```bash
npm install
npm run content   # generates audio + dictionary data (needs internet)
npm run dev       # opens http://localhost:5173
```

Checks:

```bash
npm run typecheck
npm run lint
npm test          # the pipeline's pure functions
```

## How it works

The project is split in two halves that meet at a JSON contract
(`shared/types.ts`):

- **Build time** (`scripts/`) — turns each Markdown text into narration audio,
  word-level timings and a dictionary. Runs on demand, hits the network.
- **Run time** (`src/`) — a React app that only reads the generated files.

Generated output lands in `public/` and is not meant to be edited by hand:

```
public/data/index.json          list of texts for the sidebar
public/data/credits.json        who recorded each word, and under what licence
public/data/texts/<slug>.json   tokens, per-voice timings, dictionary
public/media/texts/<slug>/*.mp3 full narration, one file per voice
public/media/voices/*.mp3       one clip per voice, for the picker
public/media/words/*.mp3        native-speaker word recordings
```

### Where the audio comes from

**Narration** is synthesised with the Microsoft Edge neural voices
(`msedge-tts`). Alongside the audio, the engine reports the exact millisecond
each word is spoken — which is what drives the highlighting. No API key is
needed.

Every text is read by all four voices in `shared/voices.ts`, and the player
picks between them — each option can be heard before it is chosen. Each reading
has its own file and its own word timings, so switching voice mid-text keeps
your place in the words rather than in the seconds.

**Individual words** are *not* synthesised. They are recordings made by native
German speakers, taken from Wiktionary's pronunciation files on Wikimedia
Commons, and downloaded into `public/media/words`. Where several exist,
standard German is preferred over Austrian or Swiss variants. Some words —
mostly function words — have no recording; the panel says so instead of
falling back to a synthetic voice.

Who made each recording, and under what licence, is fetched alongside it and
written to `public/data/credits.json`. The licences differ from file to file —
CC BY-SA at three versions, CC BY and CC0 are all in there — so they are kept
per recording rather than stated once for all of them.

**Dictionary data** (IPA, part of speech, gender, English senses, inflection →
lemma) comes from English Wiktionary via the Wiktextract dumps on
[kaikki.org](https://kaikki.org/dictionary/German/), falling back to German
Wiktionary for transcriptions it does not carry. Responses are cached in
`.cache/` so rebuilds stay cheap and polite.

**Paragraph translations** are not fetched. They are written by hand beside the
German, in `content/translations/`, and the build only reads them — which keeps
the English something the author can correct, and keeps the network out of a
step that a published site distributes the result of. A text with no
translation file falls back to MyMemory, or to DeepL when `DEEPL_API_KEY` is
set.

## Adding a text

Drop a Markdown file into `content/texts/` and run `npm run content`:

```markdown
---
title: Der erste Schnee
level: A1
topic: Everyday life
---

Es ist Winter. Anna wacht früh auf.

Über Nacht ist Schnee gefallen.
```

Blank lines separate paragraphs; sentences are detected automatically.

Write the English beside it, as `content/translations/<slug>.md` — front matter
carrying `title:`, then one paragraph per paragraph of the German:

```markdown
---
title: The First Snow
---

It is winter. Anna wakes up early.

Snow has fallen overnight.
```

It should read naturally, but the **number of sentences in a paragraph has to
match**: the two blocks are shown one under the other and read line for line.
The build counts both sides and reports it.

Optional front-matter keys:

| Key     | Default                            | Meaning                            |
| ------- | ---------------------------------- | ---------------------------------- |
| `slug`  | file name                          | URL/file identifier                |
| `level` | `A1`                               | CEFR level shown in the sidebar    |
| `topic` | —                                  | Kept in the data; not shown in the UI |
| `rate`  | `-10%`                             | Speaking rate, e.g. `-25%`, `+5%`  |

Only changed texts are rebuilt. Use `npm run content:force` to redo everything.

The voice is chosen in the app, not in the text. To change which voices exist,
edit `shared/voices.ts` and rerun `npm run content` — other German voices worth
trying are `de-DE-KatjaNeural` and `de-DE-AmalaNeural`.

## Layout

```
content/
  texts/           source texts (written by hand)
  translations/    their English, paragraph for paragraph (written by hand)
  images/          header illustrations
scripts/           build pipeline
  pipeline/
    source.ts      front matter + paragraphs
    translations.ts reads the English, checks it against the German
    tokenize.ts    sentences and words (Intl.Segmenter)
    tts.ts         narration + word boundary timings
    align.ts       maps timings onto tokens
    wiktionary.ts  dictionary lookup, inflection → lemma
    media.ts       downloads native recordings
    http.ts        throttling and retries
shared/            what both halves need
  types.ts         the JSON contract
  narration.ts     the order a document is spoken in
  voices.ts        the voice roster
  themes.ts        the theme roster
tests/             the pipeline's pure functions
src/
  components/      Sidebar, Reader, PlayerBar, WordPanel
  hooks/           narration clock, route, theme, settings
  lib/             fetching, asset paths, clip playback
```

## What it does

- **The word being spoken is lit as it is spoken**, and stays in step at any
  playback speed — the timings come from the engine that read the text, not
  from an estimate over its length.
- **Clicking a word opens it and moves the narration there**, without starting
  or stopping playback. Paused, the click also plays a native speaker saying
  that word; while the narration runs it only seeks, so the two never talk over
  each other. Both halves are toggles in the sidebar, and modifier-clicks reach
  each behaviour whatever the toggles say.
- **Four voices read every text**, and each can be heard before it is chosen.
  Switching voice mid-text keeps your place in the *words* rather than in the
  seconds, the same word being a different moment in another reading.
- **Four colour themes** — Ink and Black, then Paper and White. All four are
  deliberately flat: page and sections share one background, with only the
  player bar a step off it. Paper is the one with warm accents rather than blue.
- **The text being read is in the address**, so it can be linked to and the
  back button means something.
- **The whole interface answers to the keyboard.** The arrow keys walk the
  text, Enter opens the word under the cursor, Space plays and pauses from
  anywhere on the page, and the menus take Up/Down/Home/End.
- **The layout gives up its side columns before it gives up the prose.** The
  text list and the word panel become drawers as the window narrows, rather
  than disappearing — a phone gets everything a desktop does.
- **Attribution is in the interface**, in two places. Each word's panel ends
  with a line naming the Wiktionary entry it came from and the person who
  recorded it, with that recording's own licence — they differ from file to
  file — and both halves link out. The info window's *Sources* section carries
  what has no word to sit beside: the dictionary, the recordists, the fonts and
  the icons.

## Building

**`public/data` and `public/media` are generated and gitignored**, so a clean
checkout builds an app with nothing to read. `npm run content` fills them, and
it wants the network, minutes per text and a rate limit that no CI job should
be pointed at — which is why the two steps are separate and why the generated
files are not in the repository.

```bash
npm run content   # once, and again whenever a text changes
npm run build     # tsc + vite, into dist/
```

`npm run build` produces static files and nothing else: no server, no runtime
configuration, no service to call. Two details of it are worth knowing.

Every path the app asks for is resolved against the base it is served from
(`assetUrl`, `src/lib/assets.ts`), because at build time the pipeline cannot
know where the site will live. A subdirectory is therefore one variable:

```bash
BASE_PATH=/somewhere/ npm run build
```

And a `.br` and a `.gz` are written beside every compressible file. They are
inert until a server is told to prefer them — nginx `brotli_static`, Caddy's
`precompressed` — and where it is, a text goes from about 780 bytes per word to
160. Hosts that compress on the fly ignore them. The audio is skipped, being
compressed already.

## Licence

| What | Terms |
| ---- | ----- |
| `scripts/`, `src/`, `shared/`, `tests/`, config | AGPL-3.0 — `LICENSE` |
| `content/`, `brand/` | © 2026 heinmer, all rights reserved — `LICENSE-CONTENT` |
| `public/data/`, `public/media/` — generated | CC BY-SA, CC BY or CC0, per file |

Take the pipeline and point it at texts of your own; the AGPL asks in return
that what you build stay open, a modified version served over a network
included. The texts, the translations, the illustrations and the mark are not
part of that.

The generated files come from Wiktionary and Wikimedia Commons and are
gitignored, so this repository holds none of that material and a site built from
it distributes all of it — which is why the credit is in the interface and names
each recording's own author and licence.

Bundled dependencies keep their own terms: DM Sans and PT Serif under the SIL
Open Font License 1.1, the Lucide icons under the ISC License.

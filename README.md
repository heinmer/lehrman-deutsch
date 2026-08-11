# Lehrman-Deutsch

A local reading trainer for German: short texts, narrated end to end, with
every word clickable for pronunciation, IPA, part of speech and English
meaning. Runs entirely on your machine — after the content is generated, no
network is needed.

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

**Dictionary data** (IPA, part of speech, gender, English senses, inflection →
lemma) comes from English Wiktionary via the Wiktextract dumps on
[kaikki.org](https://kaikki.org/dictionary/German/), falling back to German
Wiktionary for transcriptions it does not carry. Responses are cached in
`.cache/` so rebuilds stay cheap and polite.

**Paragraph translations** come from MyMemory, which needs no account. Set
`DEEPL_API_KEY` before running `npm run content` to use DeepL instead — it
reads German word order and separable verbs more reliably.

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
content/texts/     source texts (the only files you write by hand)
scripts/           build pipeline
  pipeline/
    source.ts      front matter + paragraphs
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

## Notes

- Word highlighting follows the engine's own timings, so it stays in sync at
  any playback speed.
- Clicking a word opens the panel and moves the narration to that word,
  without changing whether it is playing. `Esc` closes the panel.
- While the narration is paused, clicking a word also plays its native
  recording; while it is playing, the click only seeks, so the two never talk
  over each other. The "Say word" toggle in the sidebar turns this off.
- Four colour themes, from the picker at the bottom of the sidebar: Ink and
  Black, then Paper and White. All four are deliberately flat — page and
  sections share one background, with only the player bar a step off it. Paper
  is the one with warm accents rather than blue.
- The text being read is in the address, so it can be linked to and the back
  button works.
- The whole interface is keyboard-operable: one word is in the tab order and
  the arrow keys walk the text, Enter opens the panel for the word under focus,
  and the menus answer to Up/Down/Home/End.
- Below roughly 990px the sidebar becomes a drawer, opened from the player;
  below 770px the word panel slides in over the text instead of sharing the
  width with it.
- Attribution: word recordings and dictionary content come from Wiktionary and
  Wikimedia Commons, licensed CC BY-SA. The licence asks for attribution when
  the work is *distributed*; this credit covers the local, personal use the
  project is built for. If you ever publish this site, put the credit back in
  the interface as well.

## Deploying

The app is static, and everything it asks for is resolved against the base it
is served from, so a prefix is one variable:

```bash
BASE_PATH=/lehrman-deutsch/ npm run build   # dist/ then lives under that path
```

The build also writes a `.br` and a `.gz` next to every compressible file.
Point the host at them — nginx `brotli_static`/`gzip_static`, Caddy's
`precompressed`, and similar — and a text goes from about 780 bytes per word
to 160. Hosts that compress on the fly ignore them; the audio is deliberately
left alone.

Two things are worth knowing before it goes anywhere public:

- **`public/data` and `public/media` are generated and gitignored**, so a clean
  checkout builds an app with nothing to read. `npm run content` needs the
  network, takes minutes per text and is rate-limited, which makes it a poor
  fit for a build step — the generated files want committing, caching or
  publishing as an artifact. That decision has not been made here.
- **Narration is synthesised through an undocumented Microsoft endpoint**, and
  the word recordings are CC BY-SA. Redistributing either is a different
  question from generating them for yourself.

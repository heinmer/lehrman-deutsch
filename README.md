# Texts in German

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

## How it works

The project is split in two halves that meet at a JSON contract
(`shared/types.ts`):

- **Build time** (`scripts/`) — turns each Markdown text into narration audio,
  word-level timings and a dictionary. Runs on demand, hits the network.
- **Run time** (`src/`) — a React app that only reads the generated files.

Generated output lands in `public/` and is not meant to be edited by hand:

```
public/data/index.json          list of texts for the sidebar
public/data/texts/<slug>.json   tokens, timings, dictionary
public/media/texts/<slug>.mp3   full narration
public/media/words/*.mp3        native-speaker word recordings
```

### Where the audio comes from

**Narration** is synthesised with the Microsoft Edge neural voices
(`msedge-tts`). Alongside the audio, the engine reports the exact millisecond
each word is spoken — which is what drives the highlighting. No API key is
needed.

**Individual words** are *not* synthesised. They are recordings made by native
German speakers, taken from Wiktionary's pronunciation files on Wikimedia
Commons, and downloaded into `public/media/words`. Where several exist,
standard German is preferred over Austrian or Swiss variants. Some words —
mostly function words — have no recording; the panel says so instead of
falling back to a synthetic voice.

**Dictionary data** (IPA, part of speech, gender, English senses, inflection →
lemma) comes from English Wiktionary via the Wiktextract dumps on
[kaikki.org](https://kaikki.org/dictionary/German/). Responses are cached in
`.cache/` so rebuilds stay cheap and polite.

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
| `topic` | —                                  | Short label shown under the title  |
| `voice` | `de-DE-SeraphinaMultilingualNeural` | Any Edge German voice              |
| `rate`  | `-10%`                             | Speaking rate, e.g. `-25%`, `+5%`  |

Only changed texts are rebuilt. Use `npm run content:force` to redo everything.

Other German voices worth trying: `de-DE-KatjaNeural`,
`de-DE-ConradNeural`, `de-DE-FlorianMultilingualNeural`,
`de-DE-AmalaNeural`.

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
shared/types.ts    the JSON contract
src/
  components/      Sidebar, Reader, PlayerBar, WordPanel
  hooks/           narration clock, theme
  lib/             fetching and formatting
```

## Notes

- Word highlighting follows the engine's own timings, so it stays in sync at
  any playback speed.
- Clicking a word opens the panel and moves the narration to that word,
  without changing whether it is playing. `Esc` closes the panel.
- Attribution: word recordings and dictionary content come from Wiktionary and
  Wikimedia Commons, licensed CC BY-SA. The licence asks for attribution when
  the work is *distributed*; this credit covers the local, personal use the
  project is built for. If you ever publish this site, put the credit back in
  the interface as well.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Sentence, TextDocument, TextSummary, WordToken } from "../shared/types";
import { fetchTextDocument, fetchTextIndex } from "./lib/api";
import { useToggleSetting } from "./hooks/useToggleSetting";
import { useNarration } from "./hooks/useNarration";
import { useTheme } from "./hooks/useTheme";
import { allClipSources, pronunciationClip } from "./lib/pronunciation";
import { playClip, prefetchClips } from "./lib/clipAudio";
import { Sidebar } from "./components/Sidebar";
import { Reader } from "./components/Reader";
import { PlayerBar } from "./components/PlayerBar";
import { WordPanel } from "./components/WordPanel";
import styles from "./App.module.css";

const NO_SENTENCES: Sentence[] = [];

export function App() {
  const theme = useTheme();
  const [autoSpeak, toggleAutoSpeak] = useToggleSetting("auto-speak");
  const [seekOnClick, toggleSeekOnClick] = useToggleSetting("seek-on-click");

  const [texts, setTexts] = useState<TextSummary[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [document, setDocument] = useState<TextDocument | null>(null);
  const [selectedWord, setSelectedWord] = useState<WordToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTextIndex()
      .then((index) => {
        setTexts(index.texts);
        setSlug((current) => current ?? index.texts[0]?.slug ?? null);
      })
      .catch((cause: unknown) => setError((cause as Error).message));
  }, []);

  useEffect(() => {
    if (!slug) return undefined;

    let cancelled = false;
    setDocument(null);
    setSelectedWord(null);

    fetchTextDocument(slug)
      .then((loaded) => {
        if (!cancelled) setDocument(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError((cause as Error).message);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Narration order: the title is spoken first, then the body.
  const sentences = useMemo(
    () =>
      document
        ? [document.heading, ...document.paragraphs.flatMap((p) => p.sentences)]
        : NO_SENTENCES,
    [document],
  );

  const narration = useNarration(document?.audio.src ?? null, sentences);

  // Decode the text's recordings ahead of time so a click plays instantly.
  useEffect(() => {
    if (document) void prefetchClips(allClipSources(document.dictionary));
  }, [document]);

  const { seek, isPlaying } = narration;

  // Clicking a word never changes whether the narration is playing. Moving the
  // playhead to it and speaking the word are each optional; while the
  // narration runs the clip is suppressed, or it would talk over the sentence.
  const selectWord = useCallback(
    (token: WordToken) => {
      setSelectedWord(token);
      if (seekOnClick && token.start !== null) seek(token.start);

      if (!isPlaying && autoSpeak) {
        const clip = pronunciationClip(document?.dictionary[token.key] ?? null);
        if (clip) playClip(clip.src);
      }
    },
    [seek, isPlaying, autoSpeak, seekOnClick, document],
  );

  const closePanel = useCallback(() => setSelectedWord(null), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePanel]);

  if (error) {
    return (
      <div className={styles.error}>
        <h1>Nothing to read yet</h1>
        <p>{error}</p>
        <p>
          Run <code>npm run content</code> to generate the audio and dictionary
          data, then reload this page.
        </p>
      </div>
    );
  }

  const entry = selectedWord ? document?.dictionary[selectedWord.key] ?? null : null;

  return (
    <div className={styles.app}>
      <Sidebar
        texts={texts}
        activeSlug={slug}
        onSelect={setSlug}
        theme={theme}
        autoSpeak={autoSpeak}
        onToggleAutoSpeak={toggleAutoSpeak}
        seekOnClick={seekOnClick}
        onToggleSeekOnClick={toggleSeekOnClick}
      />

      <main className={styles.main}>
        <Reader
          document={document}
          activeWordId={narration.activeWordId}
          activeSentenceId={narration.activeSentenceId}
          selectedWordId={selectedWord?.id ?? null}
          onSelectWord={selectWord}
        />
        <PlayerBar narration={narration} />
      </main>

      <WordPanel token={selectedWord} entry={entry} onClose={closePanel} />
    </div>
  );
}

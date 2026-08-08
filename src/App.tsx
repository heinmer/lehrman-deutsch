import { useCallback, useEffect, useState } from "react";
import type { TextDocument, TextSummary, WordToken } from "../shared/types";
import { fetchTextDocument, fetchTextIndex } from "./lib/api";
import { useNarration } from "./hooks/useNarration";
import { useTheme } from "./hooks/useTheme";
import { Sidebar } from "./components/Sidebar";
import { Reader } from "./components/Reader";
import { PlayerBar } from "./components/PlayerBar";
import { WordPanel } from "./components/WordPanel";
import styles from "./App.module.css";

const NO_PARAGRAPHS: TextDocument["paragraphs"] = [];

export function App() {
  const { theme, toggleTheme } = useTheme();

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

  const narration = useNarration(
    document?.audio.src ?? null,
    document?.paragraphs ?? NO_PARAGRAPHS,
  );

  const { seek } = narration;

  // Clicking a word also moves the narration there. Playback state is left
  // alone: if it was playing it keeps going from the new spot, if it was
  // paused it stays paused and simply waits there.
  const selectWord = useCallback(
    (token: WordToken) => {
      setSelectedWord(token);
      if (token.start !== null) seek(token.start);
    },
    [seek],
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
        onToggleTheme={toggleTheme}
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

import { useCallback, useEffect, useState } from "react";
import type { TextDocument, TextSummary, WordToken } from "../shared/types";
import { fetchTextDocument, fetchTextIndex } from "./lib/api";
import { useToggleSetting } from "./hooks/useToggleSetting";
import { useVoiceSetting } from "./hooks/useVoiceSetting";
import { useVolumeSetting } from "./hooks/useVolumeSetting";
import { useNarration } from "./hooks/useNarration";
import { useTheme } from "./hooks/useTheme";
import { allClipSources, pronunciationClip } from "./lib/pronunciation";
import { playClip, prefetchClips, setClipVolume } from "./lib/clipAudio";
import { Sidebar } from "./components/Sidebar";
import { Reader } from "./components/Reader";
import { PlayerBar } from "./components/PlayerBar";
import { WordPanel } from "./components/WordPanel";
import styles from "./App.module.css";

export function App() {
  const theme = useTheme();
  const [voice, setVoice] = useVoiceSetting();
  const [autoSpeak, toggleAutoSpeak] = useToggleSetting("auto-speak");
  const [seekOnClick, toggleSeekOnClick] = useToggleSetting("seek-on-click");
  const volume = useVolumeSetting();

  // One level for both playback paths: the narration element sets its own, the
  // word clips go through the Web Audio graph and are told separately.
  useEffect(() => setClipVolume(volume.effective), [volume.effective]);

  const [texts, setTexts] = useState<TextSummary[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Both of these are stored with the text they belong to and read back only
  // while that is still the text on screen. Deriving them costs a comparison
  // and saves clearing them by hand every time the choice changes — which is
  // the same thing, done later and one render too late.
  const [loaded, setLoaded] = useState<{ slug: string; document: TextDocument } | null>(null);
  const document = loaded?.slug === slug ? loaded.document : null;

  const [selection, setSelection] = useState<{ slug: string; token: WordToken } | null>(null);
  const selectedWord = selection?.slug === slug ? selection.token : null;

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

    fetchTextDocument(slug)
      .then((document) => {
        if (!cancelled) setLoaded({ slug, document });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError((cause as Error).message);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const narration = useNarration(document, voice, volume.effective);

  // Decode the text's recordings ahead of time so a click plays instantly.
  useEffect(() => {
    if (document) void prefetchClips(allClipSources(document.dictionary));
  }, [document]);

  const { seek, play, isPlaying, wordStart } = narration;

  // Clicking a word never changes whether the narration is playing. Moving the
  // playhead to it and speaking the word are each optional; while the
  // narration runs the clip is suppressed, or it would talk over the sentence.
  const selectWord = useCallback(
    (token: WordToken) => {
      if (slug) setSelection({ slug, token });

      const start = wordStart(token.id);
      if (seekOnClick && start !== null) seek(start, { fade: true });

      if (!isPlaying && autoSpeak) {
        const clip = pronunciationClip(document?.dictionary[token.key] ?? null);
        if (clip) playClip(clip.src);
      }
    },
    [seek, wordStart, isPlaying, autoSpeak, seekOnClick, document, slug],
  );

  const closePanel = useCallback(() => setSelection(null), []);

  // Unlike clicking a word, this one is a request to hear the text: it starts
  // playback even from a standstill.
  const playFromWord = useCallback(() => {
    const start = selectedWord ? wordStart(selectedWord.id) : null;
    if (start === null) return;
    seek(start);
    play();
  }, [selectedWord, wordStart, seek, play]);

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
        voiceId={voice}
        autoSpeak={autoSpeak}
        onToggleAutoSpeak={toggleAutoSpeak}
        seekOnClick={seekOnClick}
        onToggleSeekOnClick={toggleSeekOnClick}
        volume={volume}
      />

      <main className={styles.main}>
        <Reader
          document={document}
          activeWordId={narration.activeWordId}
          activeSentenceId={narration.activeSentenceId}
          selectedWordId={selectedWord?.id ?? null}
          onSelectWord={selectWord}
        />
        <PlayerBar narration={narration} voiceId={voice} onSelectVoice={setVoice} />
      </main>

      <WordPanel
        token={selectedWord}
        entry={entry}
        onClose={closePanel}
        onPlayFrom={playFromWord}
        canPlayFrom={
          narration.isReady && selectedWord !== null && wordStart(selectedWord.id) !== null
        }
      />
    </div>
  );
}

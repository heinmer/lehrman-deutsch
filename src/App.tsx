import { useCallback, useEffect, useMemo, useState } from "react";
import type { TextDocument, TextSummary, WordToken } from "../shared/types";
import { fetchTextDocument, fetchTextIndex } from "./lib/api";
import { useSlugRoute } from "./hooks/useSlugRoute";
import { useToggleSetting } from "./hooks/useToggleSetting";
import { useVoiceSetting } from "./hooks/useVoiceSetting";
import { useVolumeSetting } from "./hooks/useVolumeSetting";
import { useNarration } from "./hooks/useNarration";
import { useTheme } from "./hooks/useTheme";
import { pronunciationClip } from "./lib/pronunciation";
import { newTextOpened, playClip, setClipVolume, warmClip } from "./lib/clipAudio";
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
  // Only the index is fatal: without it there is no list, no route and nothing
  // to offer. One text failing to load is not a reason to take the rest away.
  const [indexError, setIndexError] = useState<string | null>(null);

  // The text being read lives in the URL, so it can be linked to and the back
  // button means something.
  const slugs = useMemo(() => texts.map((text) => text.slug), [texts]);
  const [slug, selectText] = useSlugRoute(slugs);

  // Both of these are stored with the text they belong to and read back only
  // while that is still the text on screen. Deriving them costs a comparison
  // and saves clearing them by hand every time the choice changes — which is
  // the same thing, done later and one render too late.
  const [loaded, setLoaded] = useState<{ slug: string; text: TextDocument } | null>(null);
  // Not named `document`: it would shadow the global one for the whole
  // component, and this file already reaches for `window`.
  const text = loaded?.slug === slug ? loaded.text : null;

  const [selection, setSelection] = useState<{ slug: string; token: WordToken } | null>(null);
  const selectedWord = selection?.slug === slug ? selection.token : null;

  // Asking again is a new attempt at the same slug, which is what clears the
  // failure — the error is remembered against the attempt that produced it.
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{ slug: string; attempt: number } | null>(null);
  const loadError =
    !text && failure?.slug === slug && failure.attempt === attempt ? slug : null;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    fetchTextIndex()
      .then((index) => setTexts(index.texts))
      .catch((cause: unknown) => setIndexError((cause as Error).message));
  }, []);

  useEffect(() => {
    if (!slug) return undefined;

    let cancelled = false;

    fetchTextDocument(slug)
      .then((loadedText) => {
        if (!cancelled) setLoaded({ slug, text: loadedText });
      })
      .catch(() => {
        if (!cancelled) setFailure({ slug, attempt });
      });

    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  const narration = useNarration(text, voice, volume.effective);

  // Recordings are warmed one at a time as the reader reaches a word (see
  // clipAudio); this only tells the cache that the ones still arriving belong
  // to a text nobody is reading any more.
  useEffect(() => newTextOpened(), [slug]);

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
        const clip = pronunciationClip(text?.dictionary[token.key] ?? null);
        if (clip) playClip(clip.src);
      }
    },
    [seek, wordStart, isPlaying, autoSpeak, seekOnClick, text, slug],
  );

  // Reaching a word is a good guess that it is about to be clicked, and a
  // fetch started now is finished by the time the click lands.
  const warmWord = useCallback(
    (token: WordToken) => {
      const clip = pronunciationClip(text?.dictionary[token.key] ?? null);
      if (clip) warmClip(clip.src);
    },
    [text],
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

  // Narrow screens have no room for the sidebar in the layout, so it becomes a
  // drawer over the reader. Wide screens never open or close anything — above
  // the breakpoint the CSS ignores this entirely.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Choosing a text is what the drawer was opened for, so it closes behind it.
  const chooseText = useCallback(
    (next: string) => {
      selectText(next);
      setDrawerOpen(false);
    },
    [selectText],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The drawer is in front of the panel, so it is what Escape means first.
      if (drawerOpen) setDrawerOpen(false);
      else closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePanel, drawerOpen]);

  // The index is the one thing there is no working around: no list, no route.
  if (indexError) {
    return (
      <div className={styles.error}>
        <h1>Nothing to read yet</h1>
        <p>{indexError}</p>
        <p>
          Run <code>npm run content</code> to generate the audio and dictionary
          data, then reload this page.
        </p>
      </div>
    );
  }

  const entry = selectedWord ? text?.dictionary[selectedWord.key] ?? null : null;

  return (
    <div className={styles.app} data-drawer={drawerOpen} data-panel={selectedWord !== null}>
      {/* Nothing at all on wide screens — `display: contents`, so the sidebar
          sits in the grid itself. The drawer only exists below the breakpoint. */}
      <div className={styles.aside} data-open={drawerOpen}>
        <Sidebar
          texts={texts}
          activeSlug={slug}
          onSelect={chooseText}
          theme={theme}
          voiceId={voice}
          autoSpeak={autoSpeak}
          onToggleAutoSpeak={toggleAutoSpeak}
          seekOnClick={seekOnClick}
          onToggleSeekOnClick={toggleSeekOnClick}
          volume={volume}
        />
      </div>

      {drawerOpen && <div className={styles.scrim} onClick={closeDrawer} role="presentation" />}

      <main className={styles.main}>
        <Reader
          text={text}
          failedSlug={loadError}
          onRetry={retry}
          activeWordId={narration.activeWordId}
          activeSentenceId={narration.activeSentenceId}
          selectedWordId={selectedWord?.id ?? null}
          onSelectWord={selectWord}
          onWarmWord={warmWord}
        />
        <PlayerBar
          narration={narration}
          voiceId={voice}
          onSelectVoice={setVoice}
          onOpenDrawer={openDrawer}
        />
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

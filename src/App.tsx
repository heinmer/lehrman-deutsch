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
import type { WordAction } from "./lib/wordAction";
import { ownsSpace } from "./lib/keys";
import { Sidebar } from "./components/Sidebar";
import { Reader } from "./components/Reader";
import { PlayerBar } from "./components/PlayerBar";
import { WordPanel } from "./components/WordPanel";
import { HelpDialog } from "./components/HelpDialog";
import styles from "./App.module.css";

export function App() {
  const theme = useTheme();
  const [voice, setVoice] = useVoiceSetting();
  const [autoSpeak, toggleAutoSpeak] = useToggleSetting("auto-speak");
  const [seekOnClick, toggleSeekOnClick] = useToggleSetting("seek-on-click");
  const [showImage, toggleShowImage] = useToggleSetting("show-image");
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

  // Asking to be read from a word is asking to hear it, so this is the one
  // path that starts playback from a standstill — the panel's button and the
  // Ctrl shortcut are the same request and behave identically.
  const readFrom = useCallback(
    (token: WordToken) => {
      const start = wordStart(token.id);
      if (start === null) return;
      seek(start);
      play();
    },
    [wordStart, seek, play],
  );

  // A plain click never changes whether the narration is playing. Moving the
  // playhead to it and speaking the word are each optional; while the
  // narration runs the clip is suppressed, or it would talk over the sentence.
  // The two modifiers replace all of that rather than adjusting it: each one
  // asks for a whole behaviour, whatever the settings happen to be.
  const selectWord = useCallback(
    (token: WordToken, action: WordAction) => {
      // Ctrl: hear the text from here, and nothing else. The word is not
      // opened, so it does not take the panel away from whatever is in it.
      if (action === "read") {
        readFrom(token);
        return;
      }

      if (slug) setSelection({ slug, token });

      // Alt: look the word up, and nothing else — the playhead stays where it
      // is and no recording is played.
      if (action === "inspect") return;

      const start = wordStart(token.id);
      if (seekOnClick && start !== null) seek(start, { fade: true });

      if (!isPlaying && autoSpeak) {
        const clip = pronunciationClip(text?.dictionary[token.key] ?? null);
        if (clip) playClip(clip.src);
      }
    },
    [readFrom, seek, wordStart, isPlaying, autoSpeak, seekOnClick, text, slug],
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

  // Unlike a plain click on a word, this one is a request to hear the text: it
  // starts playback even from a standstill.
  const playFromWord = useCallback(() => {
    if (selectedWord) readFrom(selectedWord);
  }, [selectedWord, readFrom]);

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

  // The shortcuts and whatever else the interface has no room to explain.
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Front to back: the help window covers the drawer, which covers the
      // panel — Escape closes them in the order they are stacked.
      if (helpOpen) setHelpOpen(false);
      else if (drawerOpen) setDrawerOpen(false);
      else closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePanel, drawerOpen, helpOpen]);

  // Space plays and pauses from anywhere, which is what every media player has
  // taught people to expect — and what a spacebar that worked only while the
  // play button happened to hold the focus was not. Nothing keeps it merely by
  // sitting in the focus: it is given up by asking for it (`preventDefault`,
  // which is how the pickers' options take it) or by being something typed
  // into (`ownsSpace`). Buttons therefore lose it and keep Enter.
  const { toggle } = narration;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat) return;
      // A chord belongs to somebody else — Shift+Space is a page up.
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      // Already claimed on the way up. React's listeners sit on the root
      // container, so a component's handler has run by the time this one does.
      if (event.defaultPrevented) return;
      // The info window is read rather than listened to.
      if (helpOpen || ownsSpace(event.target)) return;

      // This suppresses the focused button's own activation as well as the
      // page scroll: without it the spacebar would play *and* press whatever
      // the last click left under the focus.
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpOpen, toggle]);

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
  // The header illustration travels in the index rather than the document (see
  // TextSummary), so it is looked up here beside the text it belongs to. Turned
  // off, it is not rendered at all rather than hidden: an <img> the reader has
  // asked not to see should not be downloaded either.
  const image =
    (showImage ? texts.find((summary) => summary.slug === slug)?.image : null) ?? null;

  return (
    <div className={styles.app}>
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
          showImage={showImage}
          onToggleShowImage={toggleShowImage}
          volume={volume}
          onOpenHelp={openHelp}
        />
      </div>

      {drawerOpen && <div className={styles.scrim} onClick={closeDrawer} role="presentation" />}

      {/* The panel's own, for where it is a drawer as well. It is rendered
          whenever a word is chosen and shown only below that breakpoint —
          above it the panel is a column in the layout, and a click beside it
          is a click on the reader. */}
      {selectedWord && (
        <div className={styles.panelScrim} onClick={closePanel} role="presentation" />
      )}

      <main className={styles.main}>
        {/* One section, and the player is inside it: it rides at the end of the
            reader's flow so that it is the width of the text and not of the
            column — see Reader's `children`. */}
        <Reader
          text={text}
          image={image}
          failedSlug={loadError}
          onRetry={retry}
          activeWordId={narration.activeWordId}
          activeSentenceId={narration.activeSentenceId}
          selectedWordId={selectedWord?.id ?? null}
          onSelectWord={selectWord}
          onWarmWord={warmWord}
        >
          <PlayerBar
            narration={narration}
            voiceId={voice}
            onSelectVoice={setVoice}
            onOpenDrawer={openDrawer}
          />
        </Reader>
      </main>

      {/* Like the sidebar's wrapper: nothing at all while the panel is a
          column of the layout, a drawer over the reader below 48rem. */}
      <div className={styles.panelHost} data-open={selectedWord !== null}>
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

      {/* Last, and over everything: it is opened from the sidebar, which on a
          narrow screen is itself a drawer in front of the reader. */}
      {helpOpen && <HelpDialog onClose={closeHelp} />}
    </div>
  );
}

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/** A boundary event reported by the speech engine, in seconds. */
export interface Boundary {
  text: string;
  start: number;
  end: number;
}

export interface Narration {
  audio: Buffer;
  words: Boundary[];
  durationSec: number;
}

interface RawMetadata {
  Metadata: Array<{
    Type: string;
    Data: {
      Offset: number;
      Duration: number;
      text?: { Text: string };
    };
  }>;
}

/** The engine reports time in 100-nanosecond ticks. */
const TICKS_PER_SECOND = 1e7;

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Narrates the whole text in one request and captures per-word timings
 * alongside the audio, so the reader can highlight exactly what is spoken.
 *
 * Only word boundaries are requested: the engine's own sentence segmentation
 * disagrees with the text's (it merges quoted speech with what follows), so
 * sentence timings are derived from the words instead.
 */
export async function synthesize(
  text: string,
  voice: string,
  rate: string,
): Promise<Narration> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
      wordBoundaryEnabled: true,
    });

    const { audioStream, metadataStream } = tts.toStream(escapeSsml(text), { rate });

    const audioChunks: Buffer[] = [];
    const metaChunks: string[] = [];
    audioStream.on("data", (chunk: Buffer) => audioChunks.push(chunk));
    metadataStream?.on("data", (chunk: Buffer) => metaChunks.push(chunk.toString("utf8")));

    await new Promise<void>((resolve, reject) => {
      audioStream.on("close", () => resolve());
      audioStream.on("error", reject);
      metadataStream?.on("error", reject);
    });

    const words: Boundary[] = [];

    for (const chunk of metaChunks) {
      let parsed: RawMetadata;
      try {
        parsed = JSON.parse(chunk) as RawMetadata;
      } catch {
        continue;
      }
      for (const event of parsed.Metadata ?? []) {
        const label = event.Data.text?.Text;
        if (!label) continue;
        const boundary: Boundary = {
          text: label,
          start: event.Data.Offset / TICKS_PER_SECOND,
          end: (event.Data.Offset + event.Data.Duration) / TICKS_PER_SECOND,
        };
        if (event.Type === "WordBoundary") words.push(boundary);
      }
    }

    // Events can interleave across chunks; playback order is what matters.
    words.sort((a, b) => a.start - b.start);

    const audio = Buffer.concat(audioChunks);
    if (audio.length === 0) {
      throw new Error("speech synthesis returned no audio");
    }

    return { audio, words, durationSec: words.at(-1)?.end ?? 0 };
  } finally {
    tts.close();
  }
}

import { USER_AGENT } from "./config.ts";
import { log, sleep } from "./util.ts";

/** Starting gap between requests to the same host, in milliseconds. */
const BASE_THROTTLE_MS = 350;

const lastRequestAt = new Map<string, number>();
const hostDelay = new Map<string, number>();

async function throttle(host: string): Promise<void> {
  const delay = hostDelay.get(host) ?? BASE_THROTTLE_MS;
  const previous = lastRequestAt.get(host) ?? 0;
  const wait = previous + delay - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

/**
 * A rate limit applies to the host, not only to the request that happened to
 * receive it. Keep the server's requested delay as the new host-wide floor;
 * otherwise one successful retry immediately sends the next file too soon.
 */
function slowDown(host: string, retryDelay: number): void {
  hostDelay.set(host, rateLimitedHostDelay(hostDelay.get(host) ?? BASE_THROTTLE_MS, retryDelay));
}

/** Ease back towards the base pace while a host keeps saying yes. */
function speedUp(host: string): void {
  const current = hostDelay.get(host);
  if (current && current > BASE_THROTTLE_MS) {
    hostDelay.set(host, Math.max(current * 0.9, BASE_THROTTLE_MS));
  }
}

export class NotFoundError extends Error {}

/** Parses both forms allowed by HTTP: delay-seconds and an absolute date. */
export function retryDelayMs(value: string | null, attempt: number, now = Date.now()): number {
  if (value !== null) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(date - now, 0);
  }

  return 1000 * 2 ** (attempt - 1);
}

/** A server-provided cooldown may raise a host's pace, never lower it. */
export function rateLimitedHostDelay(current: number, retryDelay: number): number {
  return Math.max(current, retryDelay);
}

/**
 * Fetches a URL, backing off on rate limits and transient failures.
 *
 * Wikimedia throttles bursts aggressively, and a failed request must never be
 * mistaken for "this word does not exist" — so anything other than a clean 404
 * is retried and ultimately thrown.
 */
export async function fetchWithRetry(
  url: string,
  { attempts = 5, headers = {} }: { attempts?: number; headers?: Record<string, string> } = {},
): Promise<Response> {
  const host = new URL(url).host;
  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await throttle(host);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...headers },
      });

      if (response.ok) {
        speedUp(host);
        return response;
      }
      if (response.status === 404) throw new NotFoundError(url);

      const backoff = retryDelayMs(response.headers.get("retry-after"), attempt);
      if (response.status === 429) slowDown(host, backoff);

      lastError = `HTTP ${response.status}`;
      if (attempt < attempts) {
        log.info(`  ${lastError} on ${host}, retrying in ${(backoff / 1000).toFixed(1)}s`);
        await sleep(backoff);
      }
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      lastError = (error as Error).message;
      if (attempt < attempts) await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw new Error(`${url}: ${lastError}`);
}

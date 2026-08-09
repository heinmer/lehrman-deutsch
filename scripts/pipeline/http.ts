import { USER_AGENT } from "./config.ts";
import { log, sleep } from "./util.ts";

/** Starting gap between requests to the same host, in milliseconds. */
const BASE_THROTTLE_MS = 350;
const MAX_THROTTLE_MS = 4000;

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
 * Back off for the rest of the run once a host rate-limits us. Retrying at the
 * same pace just collects more 429s: Wikimedia answers those with a ten-second
 * Retry-After, so pausing briefly between requests is far cheaper than being
 * turned away.
 */
function slowDown(host: string): void {
  const next = Math.min((hostDelay.get(host) ?? BASE_THROTTLE_MS) * 1.8, MAX_THROTTLE_MS);
  hostDelay.set(host, next);
}

/** Ease back towards the base pace while a host keeps saying yes. */
function speedUp(host: string): void {
  const current = hostDelay.get(host);
  if (current && current > BASE_THROTTLE_MS) {
    hostDelay.set(host, Math.max(current * 0.9, BASE_THROTTLE_MS));
  }
}

export class NotFoundError extends Error {}

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

      if (response.status === 429) slowDown(host);

      const retryAfter = Number(response.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * 2 ** (attempt - 1);

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

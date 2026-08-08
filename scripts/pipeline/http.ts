import { USER_AGENT } from "./config.ts";
import { log, sleep } from "./util.ts";

/** Minimum gap between requests to the same host, in milliseconds. */
const HOST_THROTTLE_MS = 350;

const lastRequestAt = new Map<string, number>();

async function throttle(host: string): Promise<void> {
  const previous = lastRequestAt.get(host) ?? 0;
  const wait = previous + HOST_THROTTLE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
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
  { attempts = 5 }: { attempts?: number } = {},
): Promise<Response> {
  const host = new URL(url).host;
  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await throttle(host);

    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

      if (response.ok) return response;
      if (response.status === 404) throw new NotFoundError(url);

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

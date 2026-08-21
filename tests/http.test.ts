import assert from "node:assert/strict";
import test from "node:test";
import { rateLimitedHostDelay, retryDelayMs } from "../scripts/pipeline/http.ts";

test("Retry-After delay-seconds are converted to milliseconds", () => {
  assert.equal(retryDelayMs("10", 1), 10_000);
});

test("Retry-After HTTP dates are measured from the current time", () => {
  const now = Date.parse("Fri, 21 Aug 2026 18:00:00 GMT");
  assert.equal(retryDelayMs("Fri, 21 Aug 2026 18:00:45 GMT", 1, now), 45_000);
});

test("an absent or invalid Retry-After uses exponential backoff", () => {
  assert.equal(retryDelayMs(null, 4), 8_000);
  assert.equal(retryDelayMs("later", 3), 4_000);
});

test("a rate limit raises the whole host to the server's requested pace", () => {
  assert.equal(rateLimitedHostDelay(350, 10_000), 10_000);
  assert.equal(rateLimitedHostDelay(10_000, 10_000), 15_000);
  assert.equal(rateLimitedHostDelay(20_000, 10_000), 20_000);
  assert.equal(rateLimitedHostDelay(20_000, 600_000), 600_000);
});

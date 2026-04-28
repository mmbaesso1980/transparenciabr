import { describe, it, expect, vi } from "vitest";
import { withRetry, isRetryableError } from "../ingestors/core/retry.js";

describe("withRetry", () => {
  it("honors Retry-After seconds on 429", async () => {
    vi.useFakeTimers();
    let n = 0;
    const axiosish = () => {
      n += 1;
      if (n === 1) {
        const err = new Error("429");
        err.response = { status: 429, headers: { "retry-after": "1" } };
        return Promise.reject(err);
      }
      return Promise.resolve({ status: 200, data: "ok" });
    };

    const p = withRetry(() => axiosish(), { maxAttempts: 4 });
    await vi.advanceTimersByTimeAsync(1500);
    const res = await p;
    expect(res.status).toBe(200);
    expect(n).toBe(2);
    vi.useRealTimers();
  });

  it("stops after maxAttempts on repeated ECONNRESET", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(() => {
      const err = new Error("reset");
      err.code = "ECONNRESET";
      throw err;
    });

    const outcome = withRetry(fn, { maxAttempts: 6, baseMs: 1, maxMs: 2 }).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await outcome;
    expect(err).toBeInstanceOf(Error);
    expect(fn).toHaveBeenCalledTimes(6);
    vi.useRealTimers();
  });
});

describe("isRetryableError", () => {
  it("detects status 503", () => {
    const e = new Error("x");
    e.response = { status: 503 };
    expect(isRetryableError(e)).toBe(true);
  });
});

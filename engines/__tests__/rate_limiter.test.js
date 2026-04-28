import { describe, it, expect } from "vitest";
import { getLimiterForHost } from "../ingestors/core/rate_limiter.js";

describe("rate_limiter", () => {
  it("schedules jobs per host", async () => {
    const l = getLimiterForHost("example.com", { rpm: 6000, concurrent: 2 });
    let n = 0;
    await l.schedule(() => {
      n += 1;
    });
    expect(n).toBe(1);
  });
});

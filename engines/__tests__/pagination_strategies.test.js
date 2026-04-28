import { describe, it, expect } from "vitest";
import { iteratePaginationPlans } from "../ingestors/strategies/pagination/index.js";

describe("pagination strategies", () => {
  it("none yields single plan", async () => {
    const api = { pagination: { type: "none" } };
    const plans = [];
    for await (const p of iteratePaginationPlans(api)) plans.push(p);
    expect(plans.length).toBe(1);
  });

  it("year_loop expands years", async () => {
    const api = { pagination: { type: "year_loop", start_year: 2024, end_year: 2025 } };
    const plans = [];
    for await (const p of iteratePaginationPlans(api)) plans.push(p);
    expect(plans.map((x) => x.meta?.year)).toEqual([2024, 2025]);
  });
});

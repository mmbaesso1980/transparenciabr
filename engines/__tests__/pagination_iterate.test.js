import { describe, it, expect } from "vitest";
import { iteratePaginationPlans } from "../ingestors/strategies/pagination/index.js";

describe("pagination iteratePaginationPlans", () => {
  it("offset produces incrementing offsets", async () => {
    const api = {
      pagination: {
        type: "offset",
        limit_param: "l",
        offset_param: "o",
        page_size: 10,
      },
    };
    const out = [];
    for await (const p of iteratePaginationPlans(api)) {
      out.push(p);
      if (out.length >= 3) break;
    }
    expect(out[0].query.o).toBe(0);
    expect(out[1].query.o).toBe(10);
  });

  it("uf_loop yields 27 UFs", async () => {
    const api = { pagination: { type: "uf_loop" } };
    const out = [];
    for await (const p of iteratePaginationPlans(api)) out.push(p);
    expect(out.length).toBe(27);
  });

  it("cursor yields steps", async () => {
    const api = { pagination: { type: "cursor", cursor_param: "c" } };
    const first = [];
    for await (const p of iteratePaginationPlans(api)) {
      first.push(p);
      break;
    }
    expect(first[0].query).toEqual({});
  });
});

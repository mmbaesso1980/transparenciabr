import { describe, it, expect } from "vitest";
import {
  iteratePaginationPlans,
  parseLinkHeader,
} from "../ingestors/strategies/pagination/index.js";

async function collect(iter, feedbackFn) {
  const out = [];
  let fb;
  while (true) {
    const { value, done } = await iter.next(fb);
    if (done) break;
    out.push(value);
    fb = feedbackFn ? feedbackFn(value, out.length) : undefined;
  }
  return out;
}

describe("parseLinkHeader", () => {
  it("parses RFC 5988 Link header", () => {
    const header =
      '<https://api.example.com/items?page=2>; rel="next", <https://api.example.com/items?page=10>; rel="last"';
    const r = parseLinkHeader(header);
    expect(r.next).toBe("https://api.example.com/items?page=2");
    expect(r.last).toBe("https://api.example.com/items?page=10");
  });

  it("handles missing header", () => {
    expect(parseLinkHeader(undefined)).toEqual({});
  });
});

describe("cursor pagination", () => {
  it("advances when caller pushes nextCursor", async () => {
    const api = { pagination: { type: "cursor", cursor_param: "next", max_pages: 5 } };
    const it = iteratePaginationPlans(api, {});
    const cursors = ["abc", "def", null];
    let i = 0;
    const out = await collect(it, () => ({ nextCursor: cursors[i++] }));
    expect(out.length).toBe(3); // start + 2 advances; null cursor stops
    expect(out[0].query).toEqual({});
    expect(out[1].query).toEqual({ next: "abc" });
    expect(out[2].query).toEqual({ next: "def" });
  });

  it("stops if caller signals isEmpty", async () => {
    const api = { pagination: { type: "cursor" } };
    const it = iteratePaginationPlans(api, {});
    const out = await collect(it, () => ({ isEmpty: true }));
    expect(out.length).toBe(1);
  });

  it("breaks if no feedback after first step", async () => {
    const api = { pagination: { type: "cursor" } };
    const it = iteratePaginationPlans(api, {});
    const out = await collect(it, () => undefined);
    expect(out.length).toBe(1);
  });
});

describe("link_header pagination", () => {
  it("follows next link from feedback", async () => {
    const api = { pagination: { type: "link_header", max_pages: 5 } };
    const it = iteratePaginationPlans(api, {});
    const links = [
      '<https://api.example.com/p2>; rel="next"',
      '<https://api.example.com/p3>; rel="next"',
      undefined,
    ];
    let i = 0;
    const out = await collect(it, () => ({ linkHeader: links[i++] }));
    expect(out.length).toBe(3);
    expect(out[0].overrideUrl).toBeNull();
    expect(out[1].overrideUrl).toBe("https://api.example.com/p2");
    expect(out[2].overrideUrl).toBe("https://api.example.com/p3");
  });
});

describe("page pagination with isEmpty signal", () => {
  it("stops when caller reports empty page", async () => {
    const api = { pagination: { type: "page", max_pages: 100 } };
    const it = iteratePaginationPlans(api, {});
    let i = 0;
    const out = await collect(it, () => (i++ === 3 ? { isEmpty: true } : undefined));
    expect(out.length).toBe(4);
  });
});

describe("date_window daily granularity", () => {
  it("yields one plan per day", async () => {
    const api = {
      pagination: {
        type: "date_window",
        granularity: "daily",
        max_pages: 1000,
      },
    };
    const ctx = { since: "2024-01-01" };
    const it = iteratePaginationPlans(api, ctx);
    const out = [];
    for await (const p of it) out.push(p);
    expect(out.length).toBeGreaterThan(360);
    expect(out[0].pathReplacements.AAAAMMDD).toBe("20240101");
  });
});

describe("iter_ids with id_list in catalog", () => {
  it("uses pag.id_list when ctx.idList absent", async () => {
    const api = { pagination: { type: "iter_ids", id_list: [1, 2, 3] } };
    const it = iteratePaginationPlans(api, {});
    const out = [];
    for await (const p of it) out.push(p);
    expect(out.length).toBe(3);
    expect(out[1].pathReplacements.id).toBe("2");
  });
});

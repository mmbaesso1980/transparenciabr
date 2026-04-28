import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { requestHttp } from "../ingestors/core/http_client.js";

const server = setupServer();

describe("HTTP pagination patterns (MSW)", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("offset: second page returns fewer items then stops", async () => {
    server.use(
      http.get("https://api.example.test/items", ({ request }) => {
        const u = new globalThis.URL(request.url);
        const off = Number(u.searchParams.get("offset") || "0");
        if (off === 0) {
          return HttpResponse.json({ items: [{ id: 1 }, { id: 2 }], total: 3 });
        }
        return HttpResponse.json({ items: [{ id: 3 }], total: 3 });
      }),
    );

    const first = await requestHttp("https://api.example.test/items?limit=2&offset=0");
    expect(first.data.items.length).toBe(2);
    const second = await requestHttp("https://api.example.test/items?limit=2&offset=2");
    expect(second.data.items.length).toBe(1);
  });

  it("Link header next", async () => {
    server.use(
      http.get("https://api.example.test/p1", () =>
        HttpResponse.json(
          { data: [1] },
          {
            headers: { Link: '<https://api.example.test/p2>; rel="next"' },
          },
        ),
      ),
      http.get("https://api.example.test/p2", () => HttpResponse.json({ data: [2] })),
    );

    const r1 = await requestHttp("https://api.example.test/p1");
    expect(r1.data.data).toEqual([1]);
    const link = r1.headers?.link || r1.headers?.Link;
    expect(link).toContain("p2");
  });
});

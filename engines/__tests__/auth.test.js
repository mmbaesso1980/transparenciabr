import { describe, it, expect } from "vitest";
import { resolveAuth } from "../ingestors/strategies/auth/index.js";

describe("resolveAuth", () => {
  it("none returns empty headers", async () => {
    const api = { auth: { type: "none" } };
    const r = await resolveAuth(api);
    expect(r.headers).toEqual({});
    expect(r.query).toEqual({});
  });

  it("api_key_header injects header", async () => {
    process.env.CGU_API_KEY = "secret-test";
    const api = {
      auth: {
        type: "api_key_header",
        header: "chave-api-dados",
        env_var: "CGU_API_KEY",
      },
    };
    const r = await resolveAuth(api);
    expect(r.headers["chave-api-dados"]).toBe("secret-test");
    delete process.env.CGU_API_KEY;
  });

  it("api_key_query injects query param", async () => {
    process.env.NEWSAPI_KEY = "k";
    const api = {
      auth: {
        type: "api_key_query",
        query_param: "apiKey",
        env_var: "NEWSAPI_KEY",
      },
    };
    const r = await resolveAuth(api);
    expect(r.query.apiKey).toBe("k");
    delete process.env.NEWSAPI_KEY;
  });

  it("bearer sets Authorization", async () => {
    process.env.RNDS_BEARER_TOKEN = "tok";
    const api = {
      auth: { type: "bearer", env_var: "RNDS_BEARER_TOKEN" },
    };
    const r = await resolveAuth(api);
    expect(r.headers.Authorization).toBe("Bearer tok");
    delete process.env.RNDS_BEARER_TOKEN;
  });
});

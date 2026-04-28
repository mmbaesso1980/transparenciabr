import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../ingestors/core/http_client.js", () => ({
  requestHttp: vi.fn().mockResolvedValue({
    headers: { "set-cookie": ["session=abc; Path=/"] },
    data: {},
  }),
}));

const { resolveAuth } = await import("../ingestors/strategies/auth/index.js");
const { requestHttp } = await import("../ingestors/core/http_client.js");

describe("resolveAuth extended", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("certificate returns httpsAgent when PFX exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pfxtest-"));
    const pfxPath = join(dir, "c.pfx");
    writeFileSync(pfxPath, "not-real-pfx");
    process.env.CERT_PFX_PATH = pfxPath;
    const api = {
      auth: { type: "certificate", env_var: "CERT_PFX_PATH" },
    };
    const r = await resolveAuth(api);
    expect(r.httpsAgent).toBeDefined();
    delete process.env.CERT_PFX_PATH;
    rmSync(dir, { recursive: true });
  });

  it("inlabs_login sets Cookie from Set-Cookie", async () => {
    process.env.INLABS_USER = "u";
    process.env.INLABS_PASSWORD = "p";
    const api = {
      base_url: "https://inlabs.example",
      auth: { type: "inlabs_login", login_url: "https://inlabs.example/login" },
    };
    const r = await resolveAuth(api);
    expect(requestHttp).toHaveBeenCalled();
    expect(r.headers.Cookie).toContain("session=abc");
    delete process.env.INLABS_USER;
    delete process.env.INLABS_PASSWORD;
  });
});

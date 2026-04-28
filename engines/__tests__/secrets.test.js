import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSecret } from "../ingestors/strategies/secrets.js";

const mockAccess = vi.fn();

vi.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: class {
    accessSecretVersion(req) {
      return mockAccess(req);
    }
  },
}));

describe("resolveSecret", () => {
  beforeEach(() => {
    mockAccess.mockReset();
    delete process.env.TEST_SECRET_ENV;
    delete process.env.TEST_SECRET_B;
  });

  it("reads from Secret Manager when available", async () => {
    mockAccess.mockResolvedValue([{ payload: { data: Buffer.from("from-sm") } }]);
    const v = await resolveSecret("TEST_SECRET_ENV", "projects/p/secrets/s");
    expect(v).toBe("from-sm");
  });

  it("falls back to env when SM fails", async () => {
    mockAccess.mockRejectedValue(new Error("no access"));
    process.env.TEST_SECRET_B = "from-env";
    const v = await resolveSecret("TEST_SECRET_B", "projects/p/secrets/s2");
    expect(v).toBe("from-env");
  });
});

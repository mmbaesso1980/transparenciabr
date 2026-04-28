import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadCheckpoint, saveCheckpoint } from "../ingestors/core/checkpoint.js";

vi.mock("@google-cloud/storage", () => {
  const mockSave = vi.fn().mockResolvedValue(undefined);
  const mockDownload = vi.fn().mockResolvedValue([Buffer.from("{}")]);
  const mockExists = vi.fn().mockResolvedValue([true]);
  return {
    Storage: class {
      bucket() {
        return {
          file: () => ({
            exists: mockExists,
            download: mockDownload,
            save: mockSave,
          }),
        };
      }
    },
  };
});

describe("checkpoint", () => {
  beforeEach(() => {
    process.env.DATALAKE_BUCKET_STATE = "st";
    process.env.GOOGLE_CLOUD_PROJECT = "p";
  });

  it("loads and saves json", async () => {
    const c = await loadCheckpoint("x");
    expect(c).toEqual({});
    await saveCheckpoint("x", { last_offset: 1 });
  });
});

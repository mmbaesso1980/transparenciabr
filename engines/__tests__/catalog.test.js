import { describe, it, expect } from "vitest";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

describe("arsenal_apis catalog", () => {
  it("validates against schema and has unique ids", () => {
    const schema = JSON.parse(readFileSync(join(root, "config/arsenal.schema.json"), "utf8"));
    const data = JSON.parse(readFileSync(join(root, "config/arsenal_apis.json"), "utf8"));
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const ok = validate(data);
    expect(validate.errors, JSON.stringify(validate.errors)).toBeNull();
    expect(ok).toBe(true);

    const ids = data.apis.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const a of data.apis) {
      expect(JSON.stringify(a).toLowerCase()).not.toContain("firestore");
    }
  });
});

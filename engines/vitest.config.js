import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    coverage: {
      provider: "v8",
      include: [
        "ingestors/core/**/*.js",
        "ingestors/strategies/**/*.js",
      ],
    thresholds: {
      statements: 80,
      branches: 51,
      functions: 75,
      lines: 80,
    },
    },
  },
});

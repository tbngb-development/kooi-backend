import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: [path.resolve(import.meta.dirname, "./tests/setup/env.setup.ts")],
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/seeds/**", "src/server.ts", "**/*.d.ts"],
    },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});

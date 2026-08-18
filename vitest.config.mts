import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: { reporter: ["text", "html"], include: ["src/lib/**/*.ts"] },
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});

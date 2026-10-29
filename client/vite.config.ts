import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  // Relative URLs, so the build works wherever it is served from (GitHub
  // Pages under a sub-path before the custom domain is attached).
  base: "./",
  publicDir: resolve(__dirname, "../assets"),
  server: {
    port: 5173,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

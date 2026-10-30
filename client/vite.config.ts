import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { execSync } from "child_process";

/** The commit built, for the bug reports (game/bugReport.ts); "dev" outside a git checkout. */
function commit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  // Relative URLs, so the build works wherever it is served from (GitHub
  // Pages under a sub-path before the custom domain is attached).
  base: "./",
  publicDir: resolve(__dirname, "../assets"),
  define: { __BUILD__: JSON.stringify(commit()) },
  server: {
    port: 5173,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

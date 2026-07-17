import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      // Exclude non-logic surfaces: type declarations, test files, and the
      // thin marketing pages (smoke-only per the test plan). Thresholds are
      // intentionally omitted until a baseline is measured.
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/__tests__/**",
        "src/lib/demo/types.ts",
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/app/{for-clinics,for-doctors,for-nurses,privacy,terms}/**",
      ],
    },
  },
});

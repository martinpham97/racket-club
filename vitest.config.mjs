import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

/** @type {import('vitest/config').ViteUserConfig} */
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    exclude: [
      ...configDefaults.exclude,
      "convex/_generated/**",
      "convex/constants/**",
      "convex/schemas/**",
    ],
    coverage: {
      // reportsDirectory: ".tests/unit/coverage",
      exclude: [
        ...configDefaults.exclude,
        ".next/**",
        // Config files
        "**/*.config.*",
        "setup.*",
        // Generated Convex code
        "convex/_generated/**",
        "convex/constants/**",
        "convex/auth.ts",
        "convex/http.ts",
        "convex/migrations.ts",
        "**/schemas.ts",
        // Types and typings
        "**/*.d.ts",
        "test-utils/**",
        "node_modules/**",
        "**/__tests__/**",
      ],
    },
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});

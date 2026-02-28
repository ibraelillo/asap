import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.spec.ts", "packages/**/*.spec.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.sst/**",
      "**/dist/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/.old_*/**",
      "apps/web/e2e/**",
      "playwright.config.ts",
    ],
    env: {
      KUCOIN_API_KEY: process.env.KUCOIN_API_KEY ?? "",
      KUCOIN_API_SECRET: process.env.KUCOIN_API_SECRET ?? "",
      KUCOIN_API_PASSPHRASE: process.env.KUCOIN_API_PASSPHRASE ?? "",
    },
    coverage: {
      clean: true,
      enabled: true,
      reporter: ["json", "json-summary", "html", "lcov", "text", "teamcity"],
      provider: "v8",
    },
    //globalSetup: ['./tests/setup.ts']
  },
});

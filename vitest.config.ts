import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      KUCOIN_API_KEY: "67cbafebdf512e0001bbea87", //"68bf158c8711080001ae575e", //"67cbafebdf512e0001bbea87",
      KUCOIN_API_SECRET: "4bb0677f-62a9-4263-b837-b445f317dee7", //"8b12e038-68de-4298-abf8-54a6cf9542b6", // "4bb0677f-62a9-4263-b837-b445f317dee7",
      KUCOIN_API_PASSPHRASE: "Ricolino01!!",
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

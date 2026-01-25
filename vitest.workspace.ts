import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "unit",
      include: ["**/*.spec.ts"],
      reporters: ["default"],
    },
  },
  {
    test: {
      name: "e2e",
      include: ["**/*.e2e.ts"],
      reporters: ["verbose", "junit"],
    },
  },
]);

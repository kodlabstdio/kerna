import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      sync: { command: "astro sync", dependsOn: ["@kodlab/kerna#build"] },
      dev: { command: "astro dev", dependsOn: ["@kodlab/kerna#build"], cache: false },
      test: {
        command: "vp test run --config vite.config.ts tests/kerna-render.test.ts",
        dependsOn: ["@kodlab/kerna#build"],
        cache: false,
      },
    },
  },
});

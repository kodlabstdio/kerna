import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      typecheck: { command: "astro check", dependsOn: ["@kodlab/kerna-core#build"] },
      test: { command: "vp test run", dependsOn: ["@kodlab/kerna-core#build"] },
    },
  },
});

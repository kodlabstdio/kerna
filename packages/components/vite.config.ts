import { defineConfig } from "vite-plus";
import { getViteConfig } from "astro/config";

const config = defineConfig({
  pack: { entry: ["src/registry.ts"], dts: true },
  run: {
    tasks: {
      build: { command: "vp pack", dependsOn: ["@kodlab/kerna-core#build"] },
      typecheck: { command: "astro check", dependsOn: ["@kodlab/kerna-core#build"] },
      test: { command: "vp test run", dependsOn: ["@kodlab/kerna-core#build"] },
    },
  },
});

export default getViteConfig(config, { root: import.meta.dirname });

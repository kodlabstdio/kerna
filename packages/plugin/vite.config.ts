import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: { command: "vp pack", dependsOn: ["@kodlab/kerna-components#build"] },
      test: { command: "vp test run", dependsOn: ["@kodlab/kerna-components#build"] },
    },
  },
  pack: {
    dts: {
      tsgo: {},
    },
    // The admin entry is source code compiled by the host's React integration.
    exports: false,
  },
});

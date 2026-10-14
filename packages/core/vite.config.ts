import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: {},
    },
    exports: true,
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "html"],
      // core holds every domain rule, so it carries the 80% bar.
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});

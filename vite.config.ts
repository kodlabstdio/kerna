import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    // oxfmt bundled in Vite+ 1.1 can't format .astro yet (ADR-0007).
    "*.astro": "prettier --write",
  },
  fmt: {},
  lint: {
    // .astro imports only resolve under Astro's checker; that package runs `astro check` instead.
    ignorePatterns: ["packages/components/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});

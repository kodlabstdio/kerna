import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { kerna } from "@kodlab/kerna";
import { kernaAstro } from "@kodlab/kerna/astro";
import { designSystem, presets } from "./src/kerna.ts";
import { components } from "@kodlab/kerna-components/registry";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  image: {
    layout: "constrained",
    responsiveStyles: true,
  },
  integrations: [
    react(),
    emdash({
      plugins: [kerna({ designSystem, presets })],
      database: sqlite({ url: "file:./data.db" }),
      storage: local({
        directory: "./uploads",
        baseUrl: "/_emdash/api/media/file",
      }),
    }),
    kernaAstro({ document: "./src/components/KernaPageDocument.astro", components, designSystem }),
  ],
  devToolbar: { enabled: false },
});

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentRegistry, DesignSystem } from "@kodlab/kerna-core";

type SetupContext = {
  config: { cacheDir: URL; root: URL };
  injectRoute: (route: { pattern: string; entrypoint: string; prerender: false }) => void;
  addMiddleware: (middleware: { entrypoint: string; order: "pre" }) => void;
};

export interface KernaAstroOptions {
  /** A statically imported Astro Document used by both public pages and preview. */
  document: string;
  components: ComponentRegistry;
  designSystem: DesignSystem;
}

/** Adds the host compiled, authenticated private Page preview route. */
export function kernaAstro(options: KernaAstroOptions) {
  return {
    name: "@kodlab/kerna/astro",
    hooks: {
      "astro:config:setup": async ({ config, injectRoute, addMiddleware }: SetupContext) => {
        const directory = resolve(fileURLToPath(config.cacheDir), "kerna");
        await mkdir(directory, { recursive: true });
        const configuration = resolve(directory, "preview-config.json");
        const route = resolve(directory, "preview.astro");
        const middleware = resolve(directory, "middleware.ts");
        const document = resolve(fileURLToPath(config.root), options.document);
        await writeFile(
          configuration,
          JSON.stringify({
            components: options.components,
            designSystem: options.designSystem,
          }),
        );
        await writeFile(
          route,
          `---
import Document from ${JSON.stringify(document)};
export const prerender = false;
const { page, binding, nonce } = Astro.locals.kernaPreview;
---
<Document page={page} preview={{ binding, nonce }} />
`,
        );
        await writeFile(
          middleware,
          `import { defineMiddleware } from "astro:middleware";
import { admitPreview } from "@kodlab/kerna/astro/runtime";
import config from ${JSON.stringify(configuration)};
export const onRequest = defineMiddleware((context, next) => admitPreview(context, next, config));
`,
        );
        addMiddleware({ entrypoint: middleware, order: "pre" });
        injectRoute({ pattern: "/_emdash/api/kerna-preview", entrypoint: route, prerender: false });
      },
    },
  };
}

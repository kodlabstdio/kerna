---
title: Register Astro Components and Slots
description: Extend the Page renderer with trusted host-compiled Astro Components.
---

Kerna Page JSON contains Component names and content. It never contains executable modules. The host owns both the metadata registry used for validation and the statically imported Astro renderer map.

## Register a Component

Define the Component's Variants, fields and Slot rules in `src/kerna/components.ts`:

```ts
import { createComponentRegistry } from "@kodlab/kerna-core";
import { hero } from "@kodlab/kerna-components/registry";

export const components = createComponentRegistry([
  hero,
  {
    name: "Frame",
    label: "Frame",
    variants: ["plain"],
    fields: {},
    slots: {
      content: { accepts: ["Hero"], min: 0, max: 4 },
    },
  },
]);
```

Implement the renderer as Astro. Slots are named Astro slots, so child Blocks remain ordinary host-compiled output:

```astro
---
import type { Block } from "@kodlab/kerna-core";
interface Props { block: Block; preview?: boolean }
const { block, preview = false } = Astro.props;
---

<div
  id={block.props.id}
  data-kerna-id={preview ? block.props.id : undefined}
  data-kerna-component={preview ? block.type : undefined}
>
  <slot name="content" />
</div>

<style>
  .frame { padding: 1.5rem; }
</style>
```

In the host's `src/pages/kerna/[slug].astro`, import the renderer and pass both maps to `Page`:

```astro
---
import { Hero, Page } from "@kodlab/kerna-components";
import Frame from "../../components/Frame.astro";
import { components, designSystem } from "../../kerna.ts";
const renderers = { Hero, Frame };
---

<Page page={entry.data.page} designSystem={designSystem} registry={components} renderers={renderers} />
```

Keep the same registry and Design System on the host's validation and rendering paths. The default Hero renderer remains available when `renderers` is omitted. The `preview` prop is opt-in: preview-only selection markers are absent from the public route. Astro compiles each statically imported renderer, preserving its styles and assets. Never select a module from Page JSON or a request.

The host's `src/kerna.ts` composes that registry with its Design System and a complete Hero preset. This preset supplies every required Hero field and Design Token reference:

```ts
import { createDesignSystem } from "@kodlab/kerna-core";
import { components } from "./kerna/components.ts";

export { components };

export const designSystem = createDesignSystem(components, {
  ink: { type: "color", value: "#162524" },
  paper: { type: "color", value: "#f4f6f0" },
  body: { type: "typography", value: "Georgia, serif" },
  section: { type: "spacing", value: "clamp(1.5rem, 6vw, 5rem)" },
});

export const presets = {
  Hero: {
    type: "Hero",
    props: {
      id: "hero",
      variant: "centered",
      title: "A clear welcome",
      description: "Introduce what this Page offers.",
      foreground: { token: "ink" },
      background: { token: "paper" },
      typography: { token: "body" },
      spacing: { token: "section" },
    },
  },
};
```

## Connect the production editor and preview

Pass the same JSON metadata and Design System to the native plugin and optional Astro integration. `document` names one host Astro component at build time. That static import is used for both anonymous public output and the authenticated editor preview; a request cannot choose a module.

```js
// astro.config.mjs
import { kerna } from "@kodlab/kerna";
import { kernaAstro } from "@kodlab/kerna/astro";
import { components, designSystem, presets } from "./src/kerna.ts";

export default defineConfig({
  integrations: [
    emdash({ plugins: [kerna({ components, designSystem, presets })] }),
    kernaAstro({ document: "./src/components/KernaPageDocument.astro", components, designSystem }),
  ],
});
```

Build one document component around your site's existing layout. It passes preview metadata only to the private response, where the nonce and binding authorize the isolated iframe bridge. Keep the public route on the same component with no preview prop:

```astro
---
import { Page } from "@kodlab/kerna-components";
import { components, designSystem } from "../kerna.ts";
import { Hero } from "@kodlab/kerna-components";
import Frame from "../components/Frame.astro";
import { frameBridge } from "@kodlab/kerna/preview";
const renderers = { Hero, Frame };
const { page, preview } = Astro.props;
const policy = preview && `default-src 'none'; script-src 'nonce-${preview.nonce}'; style-src 'unsafe-inline' ${Astro.url.origin}; img-src data: ${Astro.url.origin}; font-src data: ${Astro.url.origin}; connect-src 'none'; form-action 'none'; base-uri ${Astro.url.origin}`;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    {preview && <meta http-equiv="Content-Security-Policy" content={policy} />}
    <title>Page</title>
  </head>
  <body>
    <main><Page page={page} designSystem={designSystem} preview={!!preview} registry={components} renderers={renderers} /></main>
    {preview && <script is:inline data-kerna-bridge={preview.binding.token} nonce={preview.nonce} set:html={`(${frameBridge.toString()})(${JSON.stringify(preview.binding)});`} />}
  </body>
</html>
```

Import `components` and the statically imported `renderers` map in the frontmatter alongside `Page`. Keep any host layout metadata, styles, asset links and fonts in this shared document so the preview compiles the same design as the public route. Use a restrictive preview Content Security Policy and keep the bridge script nonce-bound. The integration checks Editor permission, request protection, body size, exact envelope, existing content access and core Page validation before it renders. Its response is private and uncached; output is capped at 4 MB, with at most two actual renders active and a best-effort 10 second response deadline. Trusted synchronous Astro code cannot be interrupted while it blocks the event loop.

Kerna's production preview integration and frame policy are covered in the [trusted rendering guide](/guides/trusted-astro-rendering/). Component registration alone does not add private preview routes.

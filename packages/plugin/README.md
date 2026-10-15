# @kodlab/kerna

Agent-first Pages for EmDash. Kerna is a native plugin; the host owns routing and its theme layout. These packages are under development and are not yet published to npm.

## Install in a host site

Add `@kodlab/kerna`, `@kodlab/kerna-core` and `@kodlab/kerna-components` to the host. Use EmDash 1.2+, Astro 7 and its React integration for the admin entry.

Define the site's Design System once in `src/kerna.ts`:

```ts
import { createDesignSystem } from "@kodlab/kerna-core";
import { components } from "@kodlab/kerna-components/registry";

export const designSystem = createDesignSystem(components, {
  ink: { type: "color", value: "#162524" },
  paper: { type: "color", value: "#f4f6f0" },
  body: { type: "typography", value: "Georgia, serif" },
  section: { type: "spacing", value: "clamp(1.5rem, 6vw, 5rem)" },
});
```

In `astro.config.mjs`, add `kerna({ designSystem })` to the existing `emdash({ plugins: [...] })` array, importing `kerna` from `@kodlab/kerna` and `designSystem` from `./src/kerna.ts`. Keep the host's existing EmDash database, storage and React integration configuration.

Start the site, sign in as an admin, open **Kerna** and select **Set up Kerna**. This creates the `kerna_pages` collection, including drafts, revisions and preview. It is safe to retry. Incompatible existing schema is reported for the admin to repair.

Add **one route**, `src/pages/kerna/[slug].astro`, using your existing layout:

```astro
---
import { decodeSlug, getEmDashEntry } from "emdash";
import { Page } from "@kodlab/kerna-components";
import Layout from "../../layouts/Base.astro";
import { designSystem } from "../../kerna";

const slug = decodeSlug(Astro.params.slug);
if (!slug) return new Response("Not found", { status: 404 });
const { entry, error, isPreview, cacheHint } = await getEmDashEntry("kerna_pages", slug);
if (!entry) return new Response("Page unavailable", { status: error ? 500 : 404 });
if (Astro.cache?.enabled) Astro.cache.set(cacheHint);
---

<Layout title={entry.data.title}>
  {isPreview && <p role="status">Preview — unpublished changes</p>}
  <Page page={entry.data.page} designSystem={designSystem} />
</Layout>
```

`getEmDashEntry` serves published content to the public and resolves drafts through EmDash's signed preview or authorized edit mode. Do not replace it with a draft-reading admin API. The collection's preview URL pattern matches this route. After setup, restart the dev server or regenerate EmDash types if the collection is not yet recognized by TypeScript.

The renderer revalidates the stored Page and shows a safe fallback for invalid documents. Hero outputs HTML and CSS, with no client runtime. A host layout can add its own scripts; disable optional host interactions when a route must ship no executable JavaScript. The playground's `Base` layout accepts `search={false}` for that purpose. EmDash's authenticated editing toolbar is separate from anonymous public output.

Design Tokens become `:root` custom properties. Simple names map directly (`ink` → `--kerna-ink`); punctuation is encoded to avoid collisions. Import `tokenVariable` from `@kodlab/kerna-components` when the theme needs the name of a token. Token values must be single CSS values, without declaration delimiters, escapes, comments or markup. Typography values currently contain a font-family stack.

## Develop this repository

Use Node 24, run `vp install`, then `vp run -r sync`. Sync builds the Node-facing registry and plugin before Astro loads their config. Run `vp run dev` for the playground and `vp run ready` for repository validation.

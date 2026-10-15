# @kodlab/kerna

Agent-first Pages for EmDash. Kerna is a native plugin; the host owns routing and its theme layout. These packages are under development and are not yet published to npm.

## Install in a host site

Add `@kodlab/kerna`, `@kodlab/kerna-core` and `@kodlab/kerna-components` to the host. Use EmDash 1.2+, Astro 7 and its React integration for the admin entry.

Until publication, use a local checkout with its dependencies installed and packages built. From that checkout, run `vp run -r sync` with Node 24 before linking the packages into a separate host. The core, plugin and Component registry exports point to generated `dist` files; linking an unbuilt checkout fails package resolution. The host still needs its own working EmDash database, storage, Astro adapter and admin authentication. The repository playground already supplies that host configuration; a separate consumer must supply it too.

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

<Layout title={entry.data.title} search={false}>
  {isPreview && <p role="status">Preview — unpublished changes</p>}
  <Page page={entry.data.page} designSystem={designSystem} />
</Layout>
```

`getEmDashEntry` serves published content to the public and resolves drafts through EmDash's signed preview or authorized edit mode. Do not replace it with a draft-reading admin API. The collection's preview URL pattern matches this route. After setup, restart the dev server or regenerate EmDash types if the collection is not yet recognized by TypeScript.

In EmDash 1.2, an expired, tampered or mismatched preview token falls back to published content with `isPreview: false`, or returns no entry when the Page is unpublished. A valid matching token returns the draft with `isPreview: true`. Test preview links without an editor session: authenticated edit mode can independently authorize draft access. A newer draft does not replace the public revision until it is published.

The renderer revalidates the stored Page and shows a safe fallback for invalid documents. Hero outputs HTML and CSS, with no client runtime. A host layout can add its own scripts; disable optional host interactions when a route must ship no executable JavaScript. The example uses the playground's `Base` layout API, `search={false}`; adapt that prop to your host layout's supported way of disabling optional scripts. EmDash's authenticated editing toolbar is separate from anonymous public output.

In the playground, `search={false}` removes the search control as well as its script. Ordinary navigation links remain HTML links. Other themes must check their own optional interactions and the complete anonymous response, including EmDash contributions, before claiming a route has no executable scripts.

Design Tokens become `:root` custom properties. Simple names map directly (`ink` → `--kerna-ink`); punctuation is encoded to avoid collisions. Import `tokenVariable` from `@kodlab/kerna-components` when the theme needs the name of a token. Token values must be single CSS values, without declaration delimiters, escapes, comments or markup. Typography values currently contain a font-family stack.

## Diagnose an unavailable Page privately

The public fallback intentionally contains no validation details. The renderer does not log invalid stored Pages. In a trusted server-side diagnostic session, call `readPage` from `@kodlab/kerna-core` with the stored Page, `getEnabledComponents(components, designSystem)` and `designSystem.tokens`. When `ok` is false, inspect `errors` privately for the field/path and allowed values. Correct the invalid Block or token reference through the editor, then preview before publishing. An unsupported future `formatVersion` requires a compatible renderer; do not repair it by changing the version number.

Unsafe trusted token configuration is different: rendering throws `Unsafe CSS value for token …` rather than returning the stored-Page fallback. Correct that named value in the site's Design System to a single CSS value, then rebuild/restart the host. Keep server errors and stored content out of public responses. For help, see the [contribution guide](../../CONTRIBUTING.md); report reproducible steps with synthetic content, without private Page data or preview URLs.

## Develop this repository

Use Node 24, run `vp install`, then `vp run -r sync`. Sync builds the Node-facing registry and plugin before Astro loads their config. Run `vp run dev` for the playground and `vp run ready` for repository validation.

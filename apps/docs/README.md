# Kerna documentation

Public developer guides and API reference, built with Astro and Starlight.

## Run locally

Use Node 24 (`.nvmrc`) and Vite+. From the repository root:

```bash
nvm use
vp install
vp run -r sync
vp run docs#dev
```

Open the local URL printed by Astro. From the repository root, build the docs:

```bash
vp run docs#build
```

Build output is in `apps/docs/dist`. Astro 7 keeps its dev server running in the
background. From `apps/docs`, stop it with `vp exec astro dev stop`.

## Write a page

Content lives in `src/content/docs/guides` and `src/content/docs/reference`.
Use Markdown frontmatter for the title and description; add the page to the
explicit sidebar in `astro.config.mjs`.

- Give each guide one reader task. Keep lookup details in reference pages.
- Use exact API names and the [project vocabulary](../../CONTEXT.md).
- Write direct verbs, descriptive headings and links that name their destination.
- Put prerequisites and command directories before commands.
- Show expected results and explain how to recover from errors.

The complete executable Proposal example lives only in
[Create your first Proposal](src/content/docs/guides/first-proposal.md).
Core tests execute its JavaScript and check its expected JSON through the built
package root. Keep both code fences complete when editing it.

See the [contribution guide](../../CONTRIBUTING.md) for repository-wide checks.

# Contributing to Kerna

Kerna is in early development. The founders at [Kod Lab Studio](https://github.com/kodlabstdio) maintain the project, decide scope and approve releases. There is no stable extension API or production release yet. This guide also applies to the founders' own changes.

## Before starting

Search existing issues and pull requests. For a bug, include a minimal reproduction and expected behavior. For a feature or architectural change, open an issue before writing code so the founders can agree on scope. Issues accepted for outside work will be labelled `help wanted`; use `good first issue` only when a maintainer has prepared a small, self-contained task.

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems through [SECURITY.md](SECURITY.md), rather than a public issue.

## Local setup

Fork and clone the repository, then use Node 24 from `.nvmrc` and install [Vite+](https://viteplus.dev/guide/):

```bash
nvm use
vp install
vp run -r sync
vp run dev
```

`sync` builds the plugin and registry before generating Astro types. The playground uses a local SQLite database and disposable development content. Production credentials are not needed for ordinary development. See the [plugin guide](packages/plugin/README.md) for its one-time admin setup. If the collection's types change, restart the dev server to regenerate them.

Astro 7 leaves its dev server running in the background. Stop it with `astro dev stop` from `apps/playground` (use `vp exec astro dev stop` if Astro is not on your PATH).

## Where code belongs

- `packages/core`: pure TypeScript domain rules. No EmDash, Astro or React imports. Work test-first and keep coverage at or above 80%.
- `packages/plugin`: translate between EmDash and core; keep domain rules in core.
- `packages/components`: Astro rendering and Component registration.
- `packages/agent`: integrations for external Agent tools.
- `apps/playground`: disposable integration host. `apps/site` and `apps/docs` are the product's website and public documentation.

Use [CONTEXT.md](CONTEXT.md) for terminology. Admin UI follows [DESIGN.md](DESIGN.md); the marketing site follows [its own design guide](apps/site/DESIGN.md). Coding-agent guidance is in [AGENTS.md](AGENTS.md). You do not need the founders' private plans or locally installed skills to build or contribute.

## Validation and pull requests

Run `vp run ready` before opening a PR. It checks the publication boundary, generates Astro types, validates formatting/lint/types and design files, runs tests, enforces core coverage and builds the workspaces. For UI changes, also test the affected flow in a browser at desktop and mobile sizes, including keyboard access and failure states; record what you tested.

CI and `ready` use `vp run test:ci`: tests stop after the first failure, finish fixture cleanup and report individual test timings. Test tasks and files run one at a time so native-host fixtures do not compete for resources or keep other files running after a failure. For a full diagnostic run that collects all failures, use `vp run -r test`.

Follow the [testing conventions](TESTING.md) when writing or changing tests: control timer behavior with fake clocks, await observable completion and keep external waits bounded. Fixed sleeps are not synchronization. The guide also covers fixture isolation, cleanup and the narrow exception for real-time integration contracts.

Keep changes focused. Add a regression test for a bug when it exercises meaningful behavior. Update affected public instructions. Do not commit credentials, local databases, the root `docs/` planning folder or local Agent skills.

Open PRs against `main` with a short explanation of the problem, resulting behavior and validation. Use a conventional title with a scope, for example `fix(core): reject duplicate Block IDs`; the allowed scopes are in [commitlint.config.js](commitlint.config.js). CI validates the PR title because squash merges use it as the commit title.

Maintainers merge through PRs after required checks pass and review conversations are resolved. While the founders are the only maintainers, approvals are not required by branch protection so a founder is not blocked from merging their own checked PR. A human review is still encouraged when another founder is available. Maintainers may close changes that do not fit the current scope. Releases remain a maintainer responsibility; do not publish packages from a contributor PR.

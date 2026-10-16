# @kodlab/kerna-core

Kerna's pure TypeScript rules for Pages, Design Systems, Operations and Proposals.
The package has no EmDash, Astro or React imports or runtime requirements.

This package is unreleased and its API is under development. Use it locally in
this repository; the guides below describe the current workspace API.

## Local development

Use Node 24 (`.nvmrc`) and Vite+. From the repository root:

```bash
nvm use
vp install
```

From `packages/core`, build the library:

```bash
vp run build
```

From `packages/core`, rebuild and run tests with coverage:

```bash
vp run test
```

The test command builds current output before executing the package-root example.
For full repository setup and checks, see the [contribution guide](../../CONTRIBUTING.md).

## Guides and reference

- [Create your first Proposal](../../apps/docs/src/content/docs/guides/first-proposal.md): run the complete example and accept a conflict-free subset.
- [Save Proposal decisions safely](../../apps/docs/src/content/docs/guides/persist-proposal-decisions.md): connect core results to authorized, atomic storage writes.
- [Proposal API](../../apps/docs/src/content/docs/reference/proposals.md): inputs, results and decision lifecycle.
- [Operations](../../apps/docs/src/content/docs/reference/operations.md): shapes, destinations, guards and limits.
- [Resolve Proposal errors](../../apps/docs/src/content/docs/reference/proposal-errors.md): identify failures and recover.

See the [project vocabulary](../../CONTEXT.md) for domain terms. Licensed under [MIT](../../LICENSE).

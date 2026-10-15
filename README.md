# Kerna

The agent-first page builder for [EmDash](https://github.com/emdash-cms/emdash), by Kod Lab Studio.

[![CI](https://github.com/kodlabstdio/kerna/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kodlabstdio/kerna/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Kerna is being built so your own Agent, running in Claude Code or Codex, can compose Pages from your site's Design System. A Reviewer accepts or rejects the Agent's proposed changes and fine-tunes the result. Public Pages render through Astro inside the host site's layout.

**Status: early development.** Kerna has no published npm release or stable API yet. The complete Agent and Reviewer workflows are still being implemented. It is not ready for production use.

## How it works

- A site's Design System defines the available Components, Variants and Design Tokens.
- Agents propose typed Operations against a Page revision; Reviewers decide what to accept.
- EmDash owns content, permissions, revisions, preview and publishing. Kerna runs as a native plugin.
- Agents use the model in their own tools. Kerna does not run or bill for LLM inference.

For the current integration, see the [plugin guide](packages/plugin/README.md). That guide describes the development snapshot; install from this repository until packages are released.

## Development

Requires Git, the Node 24 version in `.nvmrc`, and [Vite+](https://viteplus.dev/guide/). Vite+ manages the workspace's pinned pnpm version.

```bash
git clone https://github.com/kodlabstdio/kerna.git
cd kerna
nvm use
vp install
vp run ready
vp run dev
```

`vp run ready` generates Astro types, checks formatting and types, runs tests and builds the workspaces. `vp run dev` starts the disposable EmDash playground. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, package boundaries and the contribution process.

## Packages

| Path                                       | Purpose                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| [packages/core](packages/core)             | Framework-independent Page validation and Design System rules |
| [packages/plugin](packages/plugin)         | Native EmDash integration and admin screens                   |
| [packages/components](packages/components) | Built-in Astro Components and the public Page renderer        |
| [packages/agent](packages/agent)           | Agent integration package under development                   |
| [apps/playground](apps/playground)         | Disposable host for integration testing                       |
| [apps/site](apps/site)                     | Kerna's marketing site                                        |
| [apps/docs](apps/docs)                     | Public documentation site under development                   |

## Contributing and support

The founders currently maintain Kerna and set its direction. Bug reports and focused fixes are welcome; discuss larger changes in an [issue](https://github.com/kodlabstdio/kerna/issues) before implementing them. We cannot promise response times while building the MVP.

Read the [contribution guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately using the [security policy](SECURITY.md).

## License

[MIT](LICENSE) © Kod Lab Studio.

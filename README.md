# Kerna

**The agent-first page builder for [EmDash](https://github.com/emdash-cms/emdash).** By Kod Lab Studio.

Your own agent (Claude Code, Codex) composes pages from your site's Design System. You review its Proposals change by change, then fine-tune visually.

> 🚧 MVP in progress. See the [product requirements](docs/prd/mvp.md), [decisions](docs/adr/) and [task list](docs/tasks/README.md).

## Development

Requires Node 24 (`nvm use`) and [Vite+](https://viteplus.dev).

```bash
vp install
vp run ready
```

`vp run ready` generates Astro types, then checks, tests and builds everything. Contributor and agent conventions live in [AGENTS.md](AGENTS.md).

## License

MIT

# Kerna

Agent-first page builder for the EmDash CMS, by Kod Lab Studio. Agents compose Pages from a site's Design System; Reviewers accept or reject the Agent's Proposals and fine-tune.

## Before you change anything

- **Vocabulary — [CONTEXT.md](CONTEXT.md).** Name code, docs, commits and UI with its terms and steer clear of each term's _Avoid_ list. When a concept has no term or a fuzzy one, settle it in CONTEXT.md first.
- **Contributions — [CONTRIBUTING.md](CONTRIBUTING.md).** Use the agreed issue or request as acceptance criteria. A feature belongs only if it makes Agent output more reliable or on-brand, or improves the Reviewer's loop. Discuss architectural changes with the maintainers before implementation.
- **Tests — [TESTING.md](TESTING.md).** Read it before writing, changing or reviewing tests and fixtures. Use controlled clocks or observable completion, never fixed sleeps for synchronization. Apply the locally installed `$kerna-testing` skill when available; the public conventions are sufficient without that private skill.
- **Look — [DESIGN.md](DESIGN.md).** Any UI inside Kerna's admin follows it, built from EmDash's Kumo components. Kerna's brand (marketing site, docs) follows `apps/site/DESIGN.md` instead (ADR-0016). After editing either, run `vp run design:lint`. For design work (critique, polish, new pages) use the locally installed `impeccable` skill in `.claude/skills/impeccable` (not tracked by Git); its launcher binary is not installed, so it runs in its documented fallback mode.
- **Publication boundary.** Root `docs/` contains founder-only planning and stays local, as do installed skills under `.agents`, `.claude`, `.codex`, `.cursor` and `.github`. Do not force-add them or copy private planning into public issues, commits or PR descriptions. Public guides, contributor policies and `apps/docs` remain tracked. Run `vp run repo:check` to check this boundary.
- **Optional founder context.** When root `docs/` exists locally, read the relevant ADRs, MVP scope and task acceptance criteria before changing code. Record significant decisions there, and update the task's Status and index when every acceptance criterion holds. Contributors without that folder follow the public guides and agreed issue instead.
- **Local conventions.** When available, start at `docs/conventions/README.md` and load the topics relevant to the build or review. Respect each rule's established/proposed status and named enforcement; researched proposals do not become blocking policy without founder adoption. Public guides remain authoritative for contributors without private docs.

## Git workflow

- Work in the main project folder on a new branch for each feature, change or task. Add follow-up fixes as commits on that same branch; do not create additional worktrees unless the user explicitly requests one.
- Keep ignored root `docs/` work and related guidance updates on the current branch while an existing PR is active; do not create a separate branch just for local documentation. Preserve pending changes for that PR.
- When a requested worktree is no longer needed, stop its owned processes, preserve uncommitted work and unique commits, then remove it promptly. Keep private recovery archives outside tracked files.

## Planning and execution

- Use GStack for requested planning and reviews; planning-only requests stay in planning. Carry relevant PRDs, ADRs, architecture decisions, conventions and acceptance criteria into the implementation scope.
- Use the new framework's `$workflow-build` skill for implementation. When the local framework is installed, read `ai-framework/workflow/README.md`, `ai-framework/workflow/invariants.md` and `ai-framework/workflow/project-profile.json`; resume from `docs/workflow/status.md`. The profile defines the phase skill directory, approval gates, budgets and exact checks. Follow the selected variant; straightforward documentation or mechanical changes use its direct route without a full feature plan.
- Keep installed skills, `ai-framework/` and root `docs/` (including workflow records) private and ignored. Contributors without this local framework follow the public guides and agreed issue. Run `python3 ai-framework/workflow/verify_setup.py` after framework setup changes.
- Implement approved scopes directly through the Build skill in the existing checkout. Preserve unrelated work and frozen acceptance criteria. Architectural uncertainty or unresolved requirements return to planning before implementation; do not start another implementation agent without authorization.
- Read the diff and review report, then report verification evidence and unresolved review concerns. Readiness does not authorize acceptance, commits, pushes, PR creation, merging or deployment; obtain the user's explicit authorization for those actions.

Never silently renew budgets, escalate workflows, weaken checks, or claim
unperformed verification. Keep summaries concise. Acceptance, commits,
and pushes require the user's explicit instructions.

Keep a checklist of requested outcomes, separate from verification blockers.
After each attempt, report completed behavior, remaining behavior, blockers,
and the next action.

After two unsuccessful attempts on the same blocker, reassess before retrying.
Require new evidence or a changed causal hypothesis. Continue independent
requested features within existing authorization, keeping blocked verification
pending. Never let tooling or integration-proof repairs replace the task.

## Package boundaries

- `packages/core` is the deep module: every domain rule (Page format, Slots, validation, Operations, Proposals, migrations, Design System) lives here as pure TypeScript with zero imports from EmDash, Astro or React. Work test-first here (red, then green), and keep coverage at or above 80%; CI enforces it.
- `packages/plugin` (`@kodlab/kerna`) is a thin adapter: it translates between EmDash and `core` and holds no rules of its own.
- `packages/components` holds the Astro Components and their schemas.
- `packages/agent` holds the Agent Skill, Claude Code plugin and Codex config.
- `apps/playground` is disposable (end-to-end tests); `apps/site` is the real, dogfooded marketing site (ADR-0014); `apps/docs` is Starlight.

## Gotchas

- Node 24 (`.nvmrc`); Vite+ rejects Node 25.
- On a fresh clone run `vp run -r sync` before `vp check`: Astro projects only type-check after their types are generated.
- `.astro` files are type-checked by `astro check`, outside root lint. `astro check` needs TypeScript 6, so `packages/components`, `apps/site` and `apps/playground` pin it while the rest of the repo uses the TypeScript 7 catalog. `vp run -r typecheck` checks all three.
- `.astro` files are formatted by Prettier until Vite+ bundles oxfmt ≥ 0.73 (ADR-0007).
- `astro dev` (Astro 7) keeps running in the background; stop it with `astro dev stop` from the app folder.
- Commit messages are conventional commits with a required scope; allowed scopes live in `commitlint.config.js`.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# 02 — refactor(repo): restructure into packages monorepo, remove Go tooling

**What to build:** The skeleton (React client, .NET server, routes registry) moves into the `@rubichandrap/poyo-template` package under `packages/`, the root becomes a bare workspace root, and all Go tooling and its wrapper scripts are deleted. The template is devable live via a pnpm filter.

**Blocked by:** 01 — migrate workspace to pnpm.

**Status:** ready-for-agent

- [ ] `packages/poyo-template/` contains `poyo.client`, `Poyo.Server`, `routes.json`, and its own `package.json`.
- [ ] The root `package.json` is a bare workspace root (private, no `bin`, no route scripts); `pnpm-workspace.yaml` lists `packages/*` plus the template's sub-apps (`packages/poyo-template/poyo.client`, `packages/poyo-template/Poyo.Server`).
- [ ] `pnpm --filter poyo-template dev` runs the skeleton's dev flow.
- [ ] `tools/poyo/` (Go source and binaries), `poyo`, and `poyo.ps1` are deleted; the stale GitHub-Packages `publish.yml` is removed.
- [ ] Existing route/build scripts still work via the old Node implementations (not yet migrated to the project CLI).

# Specification: Poyo Monorepo Restructure and Poyo Project CLI

## Problem Statement

The Poyo repo is a hybrid that ships its own tooling into the projects it generates. Route management is split across a Go CLI (`tools/poyo/`, cross-compiled to four platform binaries) and a Node implementation (`scripts/manage-routes.js`) — only the Node one is wired into `package.json`. Every publish requires rebuilding Go binaries for all platforms, and the scaffolder copies the whole repo — Go binaries, wrapper scripts, route scripts, build glue — into every generated project, exposing scaffold internals that consumers should never see. The repo uses npm workspaces; the maintainer wants pnpm. Route tooling was moved to Go for cold-start speed, but that gain does not justify the cross-compile tax or the tooling leak.

## Solution

Restructure Poyo into a pnpm monorepo of three packages under `packages/`, with the root reduced to a bare workspace root:

- **`@rubichandrap/create-poyo-app`** — the scaffolder (TypeScript). Creates a generated project from the template: copies the template package directory wholesale, rewrites `package.json` (project name, version, `poyo` dev dependency), runs `pnpm install`.
- **`@rubichandrap/poyo`** — the project CLI (TypeScript). Dev tooling installed into generated projects: `poyo route add|update|remove|sync`, `poyo build`, `poyo generate`.
- **`@rubichandrap/poyo-template`** — the template. The clean skeleton (React client, .NET server, routes registry) with zero tooling, developed live as a workspace member.

All Go tooling is deleted. Generated projects get a clean skeleton plus the project CLI as a dev dependency — the create-next-app model: a scaffolder that copies a template, and a CLI installed from the registry. The three packages share one lockstep version, released to public npm on a git tag.

## User Stories

### Scaffolder

1. As a developer, I want to run `npx create-poyo-app MyApp` or `pnpm create poyo-app MyApp`, so that I can scaffold a new project with one command.
2. As a developer, I want to pass the project name as a positional argument (`create-poyo-app MyApp`) or via `--project`, so that scaffolding works non-interactively.
3. As a developer, I want to be prompted for a project name when none is given, so that interactive scaffolding still works.
4. As a developer, I want the scaffolder to fail with a clear message if the target directory already exists, so that I don't accidentally overwrite work.
5. As a developer, I want the generated project's code renamed from `Poyo` to my project name, so that namespaces, classes, and file names match my app.
6. As a developer, I want the generated project's `package.json` rewritten with my project name and a fresh version, so that the project is my own from the start.
7. As a developer, I want the generated project to install with `pnpm`, so that the project uses the same package manager as the monorepo.

### Generated project cleanliness

8. As a developer, I want a generated project to contain only the skeleton — no scaffolder internals, Go binaries, wrapper scripts, or route scripts — so that I never see tooling I don't own.
9. As a developer, I want the generated project to declare `@rubichandrap/poyo` as a dev dependency, so that `poyo route` and `poyo build` work inside my project.
10. As a developer, I want the generated project's `poyo` dev dependency pinned to a concrete published version, so that the project works standalone without the monorepo.
11. As a developer, I want the template to be updatable without re-scaffolding, so that I can pick up framework improvements by bumping the `poyo` version.

### Project CLI — routes

12. As a developer, I want `poyo route add /About` to register a route in the routes registry and scaffold the React page and MVC view, so that adding a page is one command.
13. As a developer, I want `poyo route add` to support `--public` and `--guest`, so that I can mark route visibility at creation.
14. As a developer, I want `poyo route add` to support `--flat`, so that single pages use a flat file layout instead of a folder.
15. As a developer, I want `poyo route add` to support `--controller` and `--action`, so that routes can map to a custom controller with a specific action.
16. As a developer, I want `poyo route add` to support `--no-view`, so that API-ish or headless routes can skip the MVC view.
17. As a developer, I want `poyo route add` to reject a duplicate route with a clear error, so that the routes registry stays consistent.
18. As a developer, I want `poyo route remove /About` to remove the route and, after confirmation, delete its React page, view, and controller files, so that cleanup is complete.
19. As a developer, I want `poyo route remove` to leave orphaned files in place (and tell me about them) when I decline deletion, so that I never lose files by accident.
20. As a developer, I want `poyo route update /About` to toggle `--public` and `--guest`, so that I can change route visibility after creation.
21. As a developer, I want `poyo route sync` to detect routes missing their files, so that I can re-scaffold or prune them.
22. As a developer, I want `poyo route sync` to detect untracked React pages and views not in the routes registry, so that I can register or delete them.
23. As a developer, I want `poyo route sync` to offer rescaffold, prune, add-untracked, and delete-untracked choices interactively, so that I can resolve discrepancies in one flow.
24. As a developer, I want the routes registry kept sorted by path on every write, so that diffs stay clean.

### Project CLI — build and generate

25. As a developer, I want `poyo build` to build the client and sync the Vite-manifest assets into the server's `wwwroot`, so that the .NET server serves the current bundle.
26. As a developer, I want `poyo build` to prune stale generated assets, so that old hashed files don't accumulate in `wwwroot`.
27. As a developer, I want `poyo build` to rewrite the server's `_ReactAssets.cshtml` with the current entry JS and CSS, so that the layout references the right files.
28. As a developer, I want `poyo generate` to produce TypeScript DTOs from the server's OpenAPI document, so that client models stay in sync with C# models.
29. As a developer, I want `poyo generate` to produce Zod validation schemas from those DTOs, so that client-side validation types match the API contract.

### Monorepo and maintenance

30. As a maintainer, I want the template developed live at `pnpm --filter poyo-template dev`, so that framework changes are iterated on a running app.
31. As a maintainer, I want to manage routes during template development with the same `poyo` command the generated projects use, so that there is one route workflow.
32. As a maintainer, I want the root to be a bare workspace root, so that tooling and skeleton concerns are cleanly separated.
33. As a maintainer, I want pnpm as the package manager (workspace, lockfile, and generated projects), so that the toolchain is consistent.
34. As a maintainer, I want all three packages to share one version, so that template ↔ tooling compatibility is guaranteed and there is one changelog.
35. As a maintainer, I want a git-tag release that compiles the TypeScript, asserts all versions match, and publishes all three to public npm, so that releasing is one action.
36. As a maintainer, I want tooling written in TypeScript, so that the route manager, build glue, and codegen stay type-safe as they grow.

## Implementation Decisions

### Repository layout

- Root becomes a bare pnpm workspace root (private, no `bin`, no route scripts). `pnpm-workspace.yaml` lists `packages/*` plus the template's sub-apps so the template's dev filter resolves.
- `packages/create-poyo-app/`, `packages/poyo/`, `packages/poyo-template/` hold the three artifacts.
- Deleted: `tools/poyo/` (Go source + binaries), `poyo`, `poyo.ps1`, `scripts/` (absorbed into `poyo`), root `poyo.client/`, `Poyo.Server/`, and `routes.json` (moved into the template), `package-lock.json`, and the stale GitHub-Packages `publish.yml`.
- `poyo.client` and `Poyo.Server` become the template package's sub-apps with their own `package.json` files, as today.

### Project CLI (`poyo`)

- Written in TypeScript, compiled with `tsc` to `dist/` for publishing; `tsx` for monorepo development.
- Command surface: `route add|update|remove|sync`, `build`, `generate`. No `dev` command — dev stays pnpm-native in the template (`pnpm --filter client dev`, `dotnet watch`).
- `route` commands port `scripts/manage-routes.js` behavior: routes registry read/write with path sorting, path→Pascal/file-path mapping, controller file creation or action injection, interactive confirmations for deletion, and sync's rescaffold/prune/add-untracked/delete-untracked flows.
- `build` ports `scripts/generate-manifest.js`: read the Vite manifest, copy only active assets into `wwwroot/generated`, prune stale files, and rewrite `_ReactAssets.cshtml`.
- `generate` ports the codegen scripts from `poyo.client/scripts/`: DTO generation from `/openapi/v1.json` and Zod schema generation.
- Heavy dependencies are loaded lazily so `poyo` startup stays fast (addresses the original Go cold-start motivation).

### Template (`@rubichandrap/poyo-template`)

- A workspace package whose directory is the skeleton: `poyo.client/`, `Poyo.Server/`, `routes.json`, and its own `package.json`.
- `package.json` declares app scripts (`dev`, `build`, `restore`) and `@rubichandrap/poyo` as a dev dependency. In the monorepo this is a `workspace:*` reference; the scaffolder rewrites it to a concrete published version on copy.
- Registered as a workspace member alongside its sub-apps so `pnpm --filter poyo-template dev` works.

### Scaffolder (`create-poyo-app`)

- Written in TypeScript. Copies the template package directory wholesale (excluding `node_modules`), rewrites the copied `package.json` (project name, fresh version, `poyo` dev dependency), runs `pnpm install`, and performs the `Poyo`→project-name rename across files.
- Resolves the template from the registry in its published form, and from the local workspace during monorepo development.
- Keeps a `--skip-install` flag so creation can be tested without a network install.

### Versioning, registry, and release

- All three packages share a single lockstep version.
- Published to public npm under the `@rubichandrap` scope (current home of `@rubichandrap/create-poyo-app`).
- GitHub Actions workflow triggered on a git tag: `pnpm install`, `tsc` build, assert all three `package.json` versions equal the tag, publish all three.

## Testing Decisions

Good tests verify external behavior through the CLI command interface — exit codes, written files, mutated `routes.json` — never internal implementation details. Poyo has no test infra today; vitest is introduced in the tooling packages.

### Testing Seam (primary)

**The `poyo` CLI executable, run against a fixture project in a temp directory.** Each `poyo` command is invoked as a child process against a minimal fixture project (a temp dir with a starter `routes.json` and page/view stubs); assertions check the filesystem side effects and the resulting `routes.json` content. This covers route add/remove/update/sync, build asset sync, and generate output in one seam — all migration logic concentrates behind the command interface.

### Testing Seam (secondary)

**The `create-poyo-app` executable with `--skip-install`.** Run against a temp target dir; assert the generated tree matches the template tree (minus exclusions) and that the copied `package.json` is rewritten correctly (project name, `poyo` version). One seam per binary is the minimum; the two CLIs cannot be merged.

### What is NOT tested

- The `pnpm install` network path (seams use `--skip-install` or fixture fixtures).
- The .NET server behavior and the React client UI — unchanged by this migration.
- Internal helpers, except pure ones (path→Pascal mapping, routes-registry sort) that are unit-tested only if they remain pure functions.

### Prior art

No prior tests exist in Poyo; the pattern is borrowed from the bootcamp repo's tooling tests — vitest in the `node` environment, mocking at the boundary (child process / file system) rather than spinning up infrastructure.

## Out of Scope

- A runtime framework package: Poyo's "framework" is the template itself; the project CLI is tooling only.
- `poyo dev`: dev process orchestration stays pnpm-native in the template.
- Changes to .NET server code or React client application code.
- Authentication, business logic, or database layers.
- Publishing the spec to the issue tracker or creating scratch tickets — deferred until the maintainer requests them.
- Adding a `files` whitelist or exclusion list to the scaffolder copy; the template package directory is the copy contract.

## Further Notes

- Reverses the deliberate Go detour recorded in `docs/adr/0001-route-tooling-in-typescript-node-not-go.md`; the monorepo structure is recorded in `docs/adr/0002-template-as-devable-workspace-package.md`.
- `CONTEXT.md` defines the domain vocabulary used here: scaffolder, template, project CLI, route manager, generated project, routes registry.
- This migration is a prerequisite for future work: a stable `poyo` CLI, consumer-facing docs, and separate scaffolder releases.
- Cold-start is kept acceptable by lazy-loading heavy CLI dependencies at import time rather than bundling them eagerly.

# Changelog

All notable changes to the Poyo monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-08-20

### Added

- Committed client route table: `routes.generated.ts` is committed at the client package root (`<client>/routes.generated.ts`) and un-ignored from `.gitignore`, eliminating TypeScript errors on fresh clones/scaffolds before the first build
- Offline OpenAPI codegen: `poyo generate` generates TypeScript DTOs and Zod schemas offline from the committed `<client>/openapi/openapi.json` snapshot without requiring a running server; `dtos.generated.ts` and `validations.generated.ts` are gitignored
- In-process OpenAPI snapshot export: `Poyo.Server` exports its OpenAPI document directly to `<client>/openapi/openapi.json` during development/staging boot via `OpenApiSnapshotExportHostedService` without network loopback requests
- Scaffolder environment bootstrap: `create-poyo-app` automatically bootstraps `.env` from `.env.example` during project scaffolding, substituting the project name
- Fixture E2E first-run validation: the release fixture verifies offline scaffold, offline codegen, offline typecheck and build, in-process snapshot export, and served page hydration attributes

### Changed

- In `poyo-template`, `dev` is aliased directly to `server:watch` (`dotnet watch` with Vite proxy) and `dev:watch` is removed
- Removed circular-deadlock `"predev": "poyo generate"` hook from `poyo.client/package.json` so `pnpm run dev` and `dotnet watch` boot without locking Vite server proxy
- Scaffolder post-scaffold prompt updated to `pnpm run restore && pnpm run generate && pnpm run dev` so offline validation schemas are generated before booting
- Documentation updated to recommend `create-poyo-app@latest` and document the `pnpm run generate` workflow

## [0.3.1] - 2026-08-16

### Fixed

- The published `create-poyo-app` resolves `@rubichandrap/poyo-template` as the release version instead of the raw `workspace:*` protocol — 0.3.0 shipped the leak (npm publish does not rewrite workspace deps; pnpm publish does) and standalone installs (`npx`/`pnpm dlx`) failed with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`. Publishing is back on `pnpm publish`, and the release fixture now gates the published scaffolder installs standalone.

## [0.3.0] - 2026-08-16

### Added

- Client runtime subpath: `usePage` ships from `@rubichandrap/poyo` as `./runtime` (ADR 0005); generated projects import the accessor from the framework package, and the template's local copy is deleted
- Route resolution ships in the client runtime (ADR 0006): `createRouteTable` from `@rubichandrap/poyo/runtime`; the template's `route-loader.ts` slims to a Vite-boundary adapter, `poyo generate` emits the gitignored typed route manifest (`RouteName`/`RoutePath` unions + `routePath()`), every route command re-emits it, and the server injects the base path (`data-base-path`) so subpath deployments bind correctly
- Release-time fixture e2e (`pnpm run test:release`): scaffolds a real project, installs `@rubichandrap/poyo` from npm at the release version, and asserts the resolved package and the `usePage` accessor in the built client bundle — red until the version is published (the npm-resolution proof)

### Changed

- The scaffolder pins the generated client's `@rubichandrap/poyo` devDependency to the release version at generate time (silent-skip when the template doesn't declare it)

## [0.2.0] - 2026-08-04

### Changed

- Route access model cut: the registry's `isPublic`/`isGuestOnly` flags are replaced by a single `access` field (`public` | `guest` | `protected`, default `protected`) written by the CLI, rejected as unknown when hand-edited, and enforced universally on the server via `RouteAccessFilter` (no per-action attributes). `SeoPolicyFilter` applies registry SEO to every route with the route name as the default title.
- `PageController` collapses to a single `Index` action and `GuestOnlyAttribute` is deleted; guest behavior folds into the registry policy. Home becomes a normal registry route (`access: guest`, SEO in the registry) and `HomeController` is removed; the fallback route loses its Home defaults so unmatched URLs get clean 404s.

### Fixed

- `Microsoft.OpenApi` pinned to 2.7.5 in the template (GHSA-v5pm-xwqc-g5wc)
- `pnpm run <script> -- <args>` invocation no longer mis-parses flags after `--` (pnpm forwards the `--` token itself)
- Generated projects now ship a `pnpm-workspace.yaml`, so `pnpm install` covers the client and server workspaces

## [0.1.1] - 2026-08-03

### Fixed

- Empty readmes on npm: none of the three packages shipped a `README.md` in its own directory, and npm renders the readme from the package directory, not the monorepo root. Added package-local `README.md` files to `@rubichandrap/poyo-template`, `@rubichandrap/poyo`, and `@rubichandrap/create-poyo-app`, and added a release-workflow guard that fails the build if any package publishes without one.

## [0.1.0] - 2026-08-03

### Added

- pnpm workspace monorepo with three lockstep packages: `@rubichandrap/poyo-template`, `@rubichandrap/poyo`, `@rubichandrap/create-poyo-app`
- `poyo` project CLI: route management (`route add/update/remove/sync`), build asset sync (`build`), and OpenAPI code generation (`generate`)
- `create-poyo-app` scaffolder: creates a generated project from the template package
- Lockstep release pipeline: tag-triggered GitHub Actions workflow that asserts all three package versions match the tag, publishes to public npm via `pnpm publish` with an `NPM_TOKEN` secret, and creates a GitHub Release from the changelog
- `scripts/assert-release-version.mjs` + `release:check` for verifying lockstep versions

### Changed

- Route, build, and codegen tooling moved from repo-root scripts into the `poyo` project CLI
- Route management moved from the Go CLI back to TypeScript (lazy-loaded deps keep startup fast)

### Removed

- All Go tooling (`tools/poyo/`, `poyo`, `poyo.ps1`)
- The stale GitHub-Packages `publish.yml` workflow
- The old whole-repo-copy scaffolder (`cli/create-poyo-app.js`)

[0.4.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.4.0
[0.3.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.1
[0.3.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.0
[0.2.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.2.0
[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

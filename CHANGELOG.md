# Changelog

All notable changes to the Poyo monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.2.0
[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

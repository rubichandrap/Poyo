# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The route manager writes the v2 registry: a single `access` field (`public` | `guest` | `protected`, default `protected`) replaces the `isPublic`/`isGuestOnly` flags, and `--public`/`--guest` map onto it
- Registry validation rejects legacy `isPublic`/`isGuestOnly` fields as unknown — no migration shim, no version marker; invalid `access` values and duplicate case-insensitive paths fail loudly

### Fixed

- `pnpm run <script> -- <args>` invocation: pnpm forwards a literal `--` token that commander treated as end-of-options, so flags after it were parsed as positionals ("too many arguments"); stray `--` tokens are now dropped before parsing

## [0.1.1] - 2026-08-03

### Fixed

- Empty npm readme: added a `README.md` documenting the `route`, `build`, and `generate` commands.

## [0.1.0] - 2026-08-03

### Added

- Route management CLI: `poyo route add`, `route update`, `route remove`, `route sync`
  - `add` scaffolds the React page, MVC view, and optional custom controller/action, honoring `--public`, `--guest`, `--flat`, `--controller`/`--action`, and `--no-view`
  - `update` toggles `--public` / `--guest`
  - `remove` deletes route files after confirmation, or reports orphans with `--keep-files`
  - `sync` detects routes missing files and untracked pages/views, offering rescaffold/prune/add/delete flows
- Build sync: `poyo build` copies active assets from the Vite manifest into `wwwroot/generated`, prunes stale files, and rewrites `_ReactAssets.cshtml` plus `wwwroot/manifest.json`
- Code generation: `poyo generate` produces TypeScript DTOs (`openapi-typescript`) and Zod schemas (`openapi-zod-client`) from the server's OpenAPI document (local file or `VITE_OPENAPI_URL`)
- Fast startup: commander and inquirer are lazy-loaded so route commands run quickly

### Changed

- Distributed as a pnpm monorepo; the project CLI is `@rubichandrap/poyo`

### Removed

- The old `scripts/manage-routes.js` Node route manager

[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

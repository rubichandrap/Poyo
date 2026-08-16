# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1-rc.1] - 2026-08-16

### Fixed

- The published manifest resolves `@rubichandrap/poyo-template` as the release version instead of the raw `workspace:*` protocol (0.3.0 shipped the leak; npm publish does not rewrite workspace deps). Standalone installs of the scaffolder work again.

## [0.3.0] - 2026-08-16

### Changed

- The generated client's `@rubichandrap/poyo` devDependency is pinned to the release version at generate time, mirroring the root-level rewrite (silent-skip when the template doesn't declare it)

## [0.2.0] - 2026-08-04

### Changed

- Generated projects inherit the v2 routes registry (single `access` field) and universal server-side access enforcement from the template
- The scaffolded project ships a `pnpm-workspace.yaml` (renamed to the project's client and server directories) so the workspace install covers the whole project

## [0.1.1] - 2026-08-03

### Fixed

- Empty npm readme: added a `README.md` documenting scaffold usage and flags.

## [0.1.0] - 2026-08-03

### Added

- Scaffolds a new Poyo project from the template package with `create-poyo-app <name>` (positional or `--project`)
- Copies the template skeleton wholesale, renames `Poyo` to the project name across files, and rewrites `package.json` with a fresh version and `@rubichandrap/poyo` pinned to the current release
- Runs `pnpm install` in the generated project, or skips it with `--skip-install`
- Resolves the template from the local workspace during monorepo development and from the registry when published

### Changed

- Rewritten in TypeScript as a standalone package; the template comes from `@rubichandrap/poyo-template` instead of copying the whole repo

### Removed

- The old whole-repo-copy `cli/create-poyo-app.js` scaffolder

[0.3.1-rc.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.1-rc.1
[0.3.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.0
[0.2.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.2.0
[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

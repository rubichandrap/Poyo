# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

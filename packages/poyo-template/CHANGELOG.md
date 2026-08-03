# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-08-03

### Fixed

- Empty npm readme: added a project-focused `README.md` that the scaffolder copies into every generated project (rename-safe for the project name).

## [0.1.0] - 2026-08-03

### Added

- The clean project skeleton: React 19 client (`poyo.client`), .NET 10 server (`Poyo.Server`), and the `routes.json` routes registry
- Route scripts wired through the project CLI: `route:add`, `route:remove`, `route:update`, `route:sync`
- Build wired through the project CLI: `client:build && poyo build && server:build`
- Code generation wired through the project CLI: `client:generate`

### Changed

- Lives in `packages/poyo-template` as a pnpm workspace package instead of the repo root
- Zero tooling of its own — all tooling comes from the `@rubichandrap/poyo` dev dependency

### Removed

- All Go tooling (`tools/poyo/`, `poyo`, `poyo.ps1`) and the repo-root scripts

[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

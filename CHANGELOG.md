# Changelog

All notable changes to the Poyo monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-03

### Added

- pnpm workspace monorepo with three lockstep packages: `@rubichandrap/poyo-template`, `@rubichandrap/poyo`, `@rubichandrap/create-poyo-app`
- `poyo` project CLI: route management (`route add/update/remove/sync`), build asset sync (`build`), and OpenAPI code generation (`generate`)
- `create-poyo-app` scaffolder: creates a generated project from the template package
- Lockstep release pipeline: tag-triggered GitHub Actions workflow that asserts all three package versions match the tag, then publishes to public npm with provenance (Trusted Publishing, no token needed)
- `scripts/assert-release-version.mjs` + `release:check` for verifying lockstep versions

### Changed

- Route, build, and codegen tooling moved from repo-root scripts into the `poyo` project CLI
- Route management moved from the Go CLI back to TypeScript (lazy-loaded deps keep startup fast)

### Removed

- All Go tooling (`tools/poyo/`, `poyo`, `poyo.ps1`)
- The stale GitHub-Packages `publish.yml` workflow
- The old whole-repo-copy scaffolder (`cli/create-poyo-app.js`)

[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0

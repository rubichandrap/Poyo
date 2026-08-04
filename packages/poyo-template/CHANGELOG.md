# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The `routes.json` registry ships the v2 access model: a single `access` field (`public` | `guest` | `protected`) replaces the legacy `isPublic`/`isGuestOnly` flags; Home, Login, and Register are `guest`, Dashboard is `protected`, all with SEO declared in the registry
- `RoutePolicy` maps `access` to policy instead of selecting controller actions; `RouteAccessFilter` enforces it universally (protected challenges anonymous users — LoginPath redirect for pages, 401 for API calls — guest redirects authenticated users to the landing path, public is open), custom-controller routes included
- `SeoPolicyFilter` applies registry SEO to every route with the route name as the default title; views no longer hardcode titles
- `PageController` collapses to a single `Index` action; Home becomes a normal registry route and `HomeController` is deleted; the fallback route loses its Home defaults so unmatched URLs 404 cleanly

### Removed

- `GuestOnlyAttribute` (guest behavior folded into the registry policy)

### Fixed

- `Microsoft.OpenApi` pinned to 2.7.5, above the transitive 2.0.0 from `Microsoft.AspNetCore.OpenApi` (GHSA-v5pm-xwqc-g5wc: crafted circular schema references crash the OpenAPI parser)
- Generated projects install their client and server dependencies: the template now ships a `pnpm-workspace.yaml` listing `poyo.client` and `Poyo.Server`, so `pnpm install` covers the whole workspace instead of the project root only

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

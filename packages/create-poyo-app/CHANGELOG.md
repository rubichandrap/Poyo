# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Fixed

- A scaffolded project no longer inherits the template's `repository`, `homepage`, `bugs` or `keywords`; the rename had turned the repository URL into `github.com/rubichandrap/<Project>`, which does not exist. **Existing projects:** delete those fields from the root `package.json`.

## [0.7.0] - 2026-11-17

### Changed

- Scaffolding keeps every framework identifier verbatim by shape rather than by a hand-kept list: a `Poyo` immediately followed by an uppercase letter (`PoyoPage`, `PoyoPageData`, a future `PoyoHost`) survives the rename, alongside `Poyo.Framework`, `AddPoyo` and `X-Poyo-Navigation`. Everything else is still the project's — `Poyo.Server`, `Poyo.Server.Tests` and the client folder are renamed.
- A generated project's `Program.cs` builds its host through the framework's `PoyoHost.CreateBuilder(args)` and applies the path base through `app.UsePoyoPathBase()` (ADR 0021), so hosting-environment, content-root and path-base fixes arrive with a package update.

## [0.6.0] - 2026-11-17

### Changed

- Newly scaffolded projects render a view's `@section Head` into the document head (ADR 0020) refuse to boot with a `Routes:LandingPath` that cannot serve the guest redirect (ADR 0004 amendment), and, published, serve their assets from whatever directory the host starts them in (ADR 0014 amendment).

## [0.5.1] - 2026-11-17

### Fixed

- The scaffolder no longer accepts a project name the generated server cannot compile under, such as `Task`, `Environment`, `Path` or `Exception`: the name becomes the root namespace and hides the type. The list is derived from the shipped C#, so a few ordinary words (`Dashboard`, `Login`) are refused too.
- Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, `LPT0`–`LPT9`, any case) are refused as project names: they scaffolded on Linux and macOS but cannot be a directory on Windows.

## [0.5.0] - 2026-11-17

## [0.5.0-beta.4] - 2026-11-17

### Changed

- The scaffolder accepts a project name only when it can serve as a C# namespace segment, an npm package name and one directory name at once: `^[A-Za-z][A-Za-z0-9_]{0,63}$`.

## [0.5.0-beta.3] - 2026-11-17

### Changed

- Newly scaffolded projects spell every registry field exactly one way, and the server enforces it (ADR 0018).
- Newly scaffolded projects publish one URL per route. Existing projects upgrading from an earlier release must apply the `Program.cs` change and repoint any link to a conventional URL at the route's declared path; see the `poyo-template` changelog for the migration note (ADR 0016).
- Newly scaffolded projects ship the Routes registry as a required deployment artifact (ADR 0014).
- Newly scaffolded projects hold a route's identity to a canonical form on disk: a `path` must begin with `/` and carry no trailing slash except the root, a `name` must be present and carry no leading or trailing slash, both must be unique ignoring case, and a `controller` and `action` are declared together or not at all (ADR 0015).
- Newly scaffolded projects give the hosting environment to the process (ADR 0017).
- Newly scaffolded projects resolve their app URLs through the runtime's base path instead of a build-time `appUrl()` helper, so a project hosted under a base path links, redirects and logs out inside it.


## [0.5.0-beta.2] - 2026-09-24

### Changed

- Newly scaffolded projects inherit controller-only Page data: data-bearing routes use `this.PoyoPage(data)`, the shared layout uses the framework's `@Html.PoyoPageData()` helper, and for the same controller-produced value document `window.SERVER_DATA` is structurally equal to navigation descriptor `pageData`.
- Generated projects now require Page data to be a JSON object or `null`; arrays and primitives fail at the controller seam.
- Conventional controller aliases are access-enforced through the matched registry route.

### Removed

- The scaffolded template no longer teaches or ships view-authored `ViewBag.ServerData` and raw layout script embedding. Existing projects must move Page data into a custom controller action that returns `this.PoyoPage(data)`, map the route in `routes.json`, add `@using Poyo.Framework` to `Views/_ViewImports.cshtml`, and replace the raw layout script with `@Html.PoyoPageData()`.

## [0.5.0-beta.1] - 2026-09-24

### Changed

- No functional changes; version aligned lockstep with the framework (0.5.0-beta.1)

## [0.5.0-beta.0] - 2026-09-23

### Changed

- Scaffolded projects inherit the bundled server core (the csproj compiles `@rubichandrap/poyo/server/**/*.cs` in place — no in-tree framework copies), no client `index.html`, and the gitignored route manifest
- The framework identifiers (`Poyo.Framework`, `AddPoyo`, `MapPoyoRoutes`, `PoyoPage`, `X-Poyo-Navigation`) are protected from the project rename, so the installed server core keeps working by construction
- `routes.generated.ts` is excluded from scaffolding (the template's committed copy no longer reaches generated projects)

### Fixed

- Scaffolding no longer copies the template's stale `routes.generated.ts` into a project whose registry may differ

## [0.4.1] - 2026-09-08

### Fixed

- Restores `.gitignore` from `.gitignore.template` at root and client package root during scaffolding
- Auto-renames `Poyo.Server` React build asset paths in `.gitignore` to use the dynamic project name
## [0.4.0] - 2026-08-20

### Added

- Scaffolder automatically copies `.env.example` to `.env` during scaffolding, setting `VITE_APP_NAME` and server environment variables

### Changed

- Post-scaffold command prompt updated to `cd <app> && pnpm run restore && pnpm run generate && pnpm run dev`
- Fresh scaffold output ships with committed `routes.generated.ts` at client root and no `predev` script

## [0.3.1] - 2026-08-16

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

[0.5.0-beta.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.5.0-beta.0
[0.4.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.4.0
[0.3.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.1
[0.3.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.0
[0.2.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.2.0
[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

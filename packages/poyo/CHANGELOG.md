# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Security

- Poyo-owned page responses now emit `Cache-Control: private, no-store`: HTML documents, navigation descriptors, access challenges, guest redirects and page errors. `Vary: X-Poyo-Navigation` is retained as the representation selector. Because the directive applies to every document, main documents are no longer eligible for the browser's back/forward cache, so cross-document Back/Forward refetches instead of restoring instantly (ADR 0013).
- The template's cookie-mutating login, refresh and logout responses apply the same policy through the project-owned `[PrivateNoStoreResponse]` filter. Unrelated API responses are unaffected.

### Fixed

- A descriptor request that the server answers with a redirect no longer commits the redirect target's page. The client requested the descriptor without following redirects, so a `protected` route's authentication challenge (or a `guest` route's landing redirect) degrades to a document load of the URL that was actually asked for. Previously the client followed the redirect, committed the other page's route, Page data and SEO, and wrote the requested URL to history, leaving the address bar and the screen describing different pages.
- Dynamic descriptor requests state `credentials: "same-origin"` explicitly. This matches the `fetch` default and changes no network behavior.
- A Back/Forward traversal that cannot fetch a descriptor now hands the URL back with `location.replace` instead of `location.assign`, so the document load settles the entry the browser already moved to rather than risking a history entry that was never rendered. Push-versus-replace for a client-initiated navigation is unchanged.



## [0.5.0-beta.2] - 2026-09-24

### Changed

- `ControllerExtensions.PoyoPage(data)` is the only controller Page data seam. It now accepts only a JSON object or `null`; C# objects serialize with camelCase names, JSON object strings are preserved, and caller-owned `JsonElement` values are cloned.
- `HtmlHelperExtensions.PoyoPageData()` owns document embedding. It emits nothing for absent data and serializes present data with `JavaScriptEncoder.Default`, preserving the same structural value returned as descriptor `pageData` for one controller-produced result.
- Navigation descriptor requests check view availability without executing Razor. A missing view returns 404, and successful document and descriptor representations carry structurally equal Page data when given the same controller-produced value; a later request can refresh time-varying fields.
- Conventional controller aliases now resolve the matched registry route for access and SEO enforcement.
- `PageResult.For` retains its public pre-serialized string API while centralizing object validation and `JsonElement` cloning at the factory boundary.
- Document Page data is emitted as an encoded JSON string parsed with `JSON.parse`, preserving special property names such as `__proto__`.

### Removed

- View-authored `ViewBag.ServerData`, raw layout script embedding, and HTML text scraping are no longer supported. Existing projects must move each view-authored payload into a controller action that returns `this.PoyoPage(data)`, map the registry route to that action, add `@using Poyo.Framework` to `Views/_ViewImports.cshtml`, and replace the raw layout script with `@Html.PoyoPageData()`. Arrays and primitives now fail at the controller seam; wrap them in a top-level property such as `{ items = values }`.

## [0.5.0-beta.1] - 2026-09-24

### Fixed

- `ensureControllerAction` escapes `actionName` before building the controller-action regex, preventing regular expression injection from controller names containing metacharacters (CodeQL alert no. 1)

## [0.5.0-beta.0] - 2026-09-23

### Added

- Server core ships as readable source under `server/` (fixed namespace `Poyo.Framework`): `RoutePolicy`, `RouteDefinition`, the universal access and SEO filters, `PageResult`, `PageController`, `ControllerExtensions.PoyoPage()`, and the `AddPoyo()` / `MapPoyoRoutes()` registration extensions. Generated projects compile it in place through their csproj — no copy step, no NuGet package
- Navigation subpaths: `@rubichandrap/poyo/runtime/router` (`createRouter`, `useRouter`) and `@rubichandrap/poyo/runtime/link` (`Link`), both re-exported from the runtime root, plus the descriptor-fetch navigation core with history writes, SEO/focus/announcement, popstate traversal, and scroll restoration
- `routePath()` and the `RouteName`/`RoutePath` types, resolved from the active route table and typed by the generated manifest; calling `routePath` before the route table initializes throws a clear error
- Registry `dynamic` field accepted and preserved by every route command, with non-boolean values rejected naming the route

### Changed

- The generated manifest (`<client>/routes.generated.ts`) becomes an ambient module augmentation of `PoyoRouteRegistry` imported by no one — it no longer exports manifest values, and the file is gitignored again (ADR 0010)

## [0.4.1] - 2026-09-08

### Changed

- No functional changes; version aligned lockstep with the framework (0.4.1)
## [0.4.0] - 2026-08-20

### Added

- `poyo generate` operates offline against `<client>/openapi/openapi.json` default snapshot without network requests
- CLI commands (`poyo route`, `poyo generate`) emit the typed route manifest to the client package root (`<client>/routes.generated.ts`)

## [0.3.0] - 2026-08-16

### Added

- `./runtime` subpath: the client runtime ships from the framework package — `usePage`, the server-data accessor, as a dependency-free module with `react` as an optional peer and `Window.SERVER_DATA?: unknown` global typing (ADR 0005)
- Route table runtime API (ADR 0006): `createRouteTable(manifest, loaders, options)` — per-load binding of registry entries to lazy components with exact-name-then-case-insensitive lookups, base-path normalization/stripping, dev-only ghost detection and unknown-page `onError` reporting, and warn+skip for missing page files
- `poyo generate` emits the typed route manifest (`src/routes/routes.generated.ts`, gitignored — literal unions + `routePath()`); every `poyo route` command re-emits it, and the OpenAPI codegen now runs only when a source is provided (no source → skip with a notice)

## [0.2.0] - 2026-08-04

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

[0.5.0-beta.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.5.0-beta.0
[0.4.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.4.0
[0.3.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.0
[0.2.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.2.0
[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Fixed

- `poyo build` fails naming the files when the Vite manifest lists assets the client build did not produce, instead of copying whatever is there and shipping a page whose script or stylesheet 404s.
- `poyo build` emits the stylesheet of every chunk the entry imports statically, not only the entry's first CSS file.
- The CLI strips only the first `--` in its arguments, the one pnpm forwards before the user's, so a `--` the caller passed later reaches the command.
- A Poyo page response keeps any `Vary` value already on it (CORS or response compression, for one) and adds `X-Poyo-Navigation` to that value instead of replacing the header. A registry route whose view file is missing answers a descriptor request the way the document does: a logged 500 through the exception handler, not an empty 404. **Upgrading:** none.
- `poyo route add` scaffolds a page that type-checks for any route name: the component identifier is derived separately (`User-profile` becomes `UserProfile`, `123` becomes `Page123`, `React` becomes `ReactPage`) and the heading renders the name as an expression, so hyphens, digits, spaces and `<`/`{` no longer break it. **Upgrading:** delete the page file, then run `route sync --rescaffold` to regenerate it.
- `poyo route add --controller` now stores the bare controller name in `routes.json` and scaffolds actions that return `this.PoyoPage(null)`, so the route answers 200 for the document and a navigation descriptor. **Upgrading:** drop the `Controller` suffix from `controller` in `routes.json` and replace `return View(...)` with `return this.PoyoPage(null)` in scaffolded actions.

### Changed

- `wwwroot/manifest.json` records `css` as an array, not a string or `null`. **Upgrading:** a consumer that reads that field as a string must read an array.
- A route path may no longer declare route-template or URL syntax — `{`, `}`, `*`, `?`, `#`, or a `%` other than `%2F` (ADR 0015). It was mapped as an ASP.NET route template but resolved literally, so `/Users/{id}` served `/Users/42` and skipped access, SEO and `no-store`. The route manager and `poyo route add` refuse it as well. **Upgrading:** correct such a registry or it will not boot.
- A route's `files.react` and `files.view` must stay inside the project: both validators refuse a `..` segment, an absolute path or a drive-rooted path, and every route command resolves and checks a file before writing or deleting it (ADR 0022). **Upgrading:** a registry declaring one now fails to start until the path is corrected.

## [0.7.1] - 2026-11-17

### Changed

- Declares npm `keywords`, `homepage` and `bugs`. No behaviour change.

## [0.7.0] - 2026-11-17

### Changed

- A route path may no longer declare an empty or dot (`.`/`..`) segment, the percent-encoded `%2e` spellings included, since the URL parser reads those as dots, nor hold a backslash, which a browser reads as `/` (ADR 0015).
- The server core carries the host bootstrap, `PoyoHost.CreateBuilder(args)`: the hosting environment is read from the process first, the environment file is development-only, and the content root follows the application's content (ADR 0021).
- The server core applies the path base: `PoyoHost.UsePoyoPathBase(this WebApplication app)` reads configuration `PathBase` once and calls `UsePathBase` only for a non-blank value (ADR 0021). Call it where the base belongs in the pipeline — before static files and routing. An unset or blank value applies nothing, and a project's own `UsePathBase` block still works.

## [0.6.0] - 2026-11-17

### Added

- Views can add SSR-only head elements (canonical, hreflang, preload) with `@section Head`; the template's `_Layout.cshtml` renders it at the end of `<head>`. Mark them `data-poyo-seo` so a dynamic navigation away removes them; a navigation descriptor never runs the view (ADR 0020). Existing projects: add `@await RenderSectionAsync("Head", required: false)` before `</head>` in their layout.

### Changed

- **Boot-time check:** `Routes:LandingPath` is validated against the registry when the registry has a guest route (ADR 0004 amendment). **Upgrading:** a project with guest routes and no `/Dashboard` route must set `Routes:LandingPath` to a non-guest route (or an absolute URL), or it will not start.
- `PageResult.For` is internal. Controllers author pages through `this.PoyoPage(data)`; the server core compiles into the application's assembly, so existing calls still compile, but the factory is no longer a supported API.

### Fixed

- Back/Forward returns to the position an entry was left at even when it was left within a frame of the last scroll (ADR 0019 decision 7).
- `router.push("#x")` and `router.replace("#x")` (or `/same-page#x`) are the browser's own fragment navigation, as an in-page anchor is, instead of a descriptor request, a second commit of the page on screen, a history entry and a scroll to the top (ADR 0019 decision 8).
- A Back/Forward to a fragment entry (`/page#section`) whose descriptor cannot be answered now reloads the entry.
- `poyo route update` re-emits `routes.generated.ts` even when the update changes nothing, as every other route command does.

## [0.5.1] - 2026-11-17

### Fixed

- A Back/Forward scroll restore no longer lands on a newer page (ADR 0019 decision 6).
- **Behavior change:** under a path base, an app path is prefixed exactly once. Code that passed an already-resolved browser URL (for example `location.pathname`) to `router.push` or `withBasePath` must pass the app path instead, as the contract already said.

## [0.5.0] - 2026-11-17

### Changed

- `poyo build` emits asset tags as `@Url.Content("~/generated/…")` and records `wwwroot/manifest.json` in the same app-relative form.

## [0.5.0-beta.4] - 2026-11-17

## [0.5.0-beta.3] - 2026-11-17

### Security

- The Routes registry is a required deployment artifact and the server core treats it as one (ADR 0014).
- Registry resolution no longer reads the process working directory — in ASP.NET it is also the default content root, so a deployment's access model no longer depends on the directory its host happened to start it in.
- Poyo-owned page responses now emit `Cache-Control: private, no-store`: HTML documents, navigation descriptors, access challenges, guest redirects and page errors (ADR 0013).
- The template's cookie-mutating login, refresh and logout responses apply the same policy through the project-owned `[PrivateNoStoreResponse]` filter. Unrelated API responses are unaffected.
- The conventional `controller/action` URL of a page route is no longer served, which closes a privacy hole in the server core's contract (ADR 0016).

### Changed

- **Breaking:** `usePage()` follows React's hook rules now that it subscribes to the store, so it must be called while a component renders. Read Page data elsewhere with `getPageData()`.
- The template resolves app URLs through the runtime: `Link` takes `routePath()` results directly, full-page redirects use `withBasePath()`, and the build-time `appUrl()` helper (`src/lib/base-url.ts`) is gone. The Dashboard logout no longer redirects to the host root under a base path.
- **Contract change:** a field has exactly one accepted spelling in the registry, and the server enforces it (ADR 0018).
- **Contract change:** a `dynamic` field spelled with the wrong case is reported for its value, with the spelling it was written in. The pre-check's lookup was case-sensitive, so a mis-spelled field was missed entirely and the deserializer's generic `is not a valid routes registry` failure answered instead — the one message naming neither the field nor the route.
- The registry's rules are held to one shared corpus, `fixtures/registry/`, read by this package's suite and by the server's; ADR 0018 names the four deliberate differences between the runtimes.
- **Contract change:** one lookup resolves every request (ADR 0016). `RoutePolicy.FindForRequest` is removed from the public server core; a consumer calling it must call `Find` with a request path.
- **Contract change:** a route's identity is defined once and enforced at boot (ADR 0015): rooted paths with no trailing slash, present slash-free names, both unique ignoring case, and `controller`/`action` declared together or not at all.
- **Contract change:** requests are still matched liberally against that strict file.
- **Contract change:** `poyo` validates the same declared-path, name, and controller/action rules on every read and write of the registry, so an invalid registry is rejected when it is authored rather than when it is deployed.
- **Contract change:** `RoutePolicy.Load(path)` throws `RoutePolicyException` for a missing file or an empty registry instead of returning an empty policy. A consumer that booted with no registry must ship one.
- **Contract change:** the default registry resolution in `AddPoyo` no longer ends at the process working directory; it ends at the application installation directory. A consumer that passed no explicit path and relied on the working directory must name the location (or ship the registry beside the application).
- `AddPoyo` takes an optional `contentRootPath`, which resolves a relative `registryPath` or `Routes:JsonPath`.

### Breaking changes

Public server-core API in this release. `@rubichandrap/poyo` is pre-1.0, so these ship in a minor; a consumer pinning the previous version and taking this one must change code.

- `RoutePolicy.Load(path)` now throws `RoutePolicyException` for a missing file, an empty file, an empty registry, and a registry that is unreadable, where it previously returned an empty route policy.
- `RoutePolicy.FindForRequest(path, controller, action)` is removed. Call `RoutePolicy.Find(path)`: route resolution is by request path only, and the conventional `controller/action` URL for a page route is no longer served (ADR 0016).
- `RouteIdentity.Validate(RouteDefinition, string)` is no longer public; validate a whole registry with `RouteIdentity.Validate(IReadOnlyList<RouteDefinition>, string)`.

### Fixed

- A registry JSON-LD value containing `</script>` no longer closes the layout's script element: `SeoPolicyFilter` re-serializes JSON-LD with HTML-sensitive characters escaped.
- The fixture e2e requested `/api/test-unrelated` for a controller routed at `/api/TestUnrelated`, so the release gate could never pass that step.
- Back/Forward to the landing page, to an in-page fragment entry, or to an entry another library pushed no longer reloads the whole document.
- Back past a same-URL entry another library pushed (an open modal, a tab) no longer reloads the page; that entry is left to its library.
- `push` no longer copies the outgoing entry's history-state keys into the new entry; `replace` still preserves them.
- `replace()` now shows the new page from the top, as `push()` does. It already wrote a top-of-page scroll record for the entry while leaving the screen at the old offset, so returning to that entry later jumped to the top.
- After a dynamic navigation the `<head>` matches the server-rendered document: the title uses the layout's format (`data-poyo-title-template`), and the previous route's description, meta tags and JSON-LD (marked `data-poyo-seo`) are replaced. **Existing projects:** add both attributes to `_Layout.cshtml`.
- `Link`, `router.push` and `router.replace` resolve app-relative hrefs against the base path, so `routePath()` results work when the app is hosted under one (e.g. `/Poyo`). Previously such a link left the app with a document load to the host's root. **Behavior change:** a root-relative `Link` href outside the base is now prefixed too; leave the app with an absolute URL or a plain `<a>`.
- Under base `/app`, the route table no longer strips `/apple` to `/le`; the base path matches on a segment boundary.
- A dynamic navigation to another page with a fragment (`/About#team`) scrolls to that element once it renders, instead of staying at the top.
- `usePage()` subscribes to the navigation store, so a page below a memoized boundary re-renders with the new Page data.
- The guest redirect resolves `Routes:LandingPath` under the request's path base: an app hosted at `/Poyo` lands on `/Poyo/Dashboard`.
- A descriptor answers with the page result's status code, like the document. A `PoyoPage` result given `StatusCode = 410` was a 200 descriptor; now the client falls back to a document load, which renders the page with its status.
- Scrolling while a Back/Forward descriptor is in flight no longer writes the outgoing page's position into the destination entry's scroll record, and traversing to an entry without a record shows its page from the top instead of at the outgoing page's offset.
- After a dynamic navigation, a route whose registry `seo` has no `title` shows the route name (as the server-rendered document does) instead of keeping the previous page's title, and a route without a description removes the description tag instead of keeping the previous page's text or an empty tag.
- A registry the process cannot reach is reported as unreachable rather than missing.
- A descriptor request that the server answers with a redirect no longer commits the redirect target's page.
- Dynamic descriptor requests state `credentials: "same-origin"` explicitly. This matches the `fetch` default and changes no network behavior.
- A Back/Forward traversal that cannot fetch a descriptor now hands the URL back with `location.replace` instead of `location.assign`, so the document load settles the entry the browser already moved to rather than risking a history entry that was never rendered.
- A client-initiated `router.replace()` that cannot fetch a descriptor now degrades to a document load through `location.replace`, so a failed replacement no longer adds a history entry; `push()` still degrades through `location.assign`.



### Added

- The page descriptor carries a format version, `"v": 1`. A client refuses a version newer than it understands and falls back to a document load; a descriptor without `v` is read as version 1.
- `getPageData()` reads Page data outside a component render (event handlers, utilities, tests). `usePage()` is the hook components call.
- `pnpm run test:release:prepublish` runs the fixture project against the tarball `pnpm pack` produces, including a real-browser check of Link, Back and Forward (`scripts/browser-navigation.mjs`). The release workflow runs it before publishing, so a broken release is caught before it is public. It needs `playwright` as a root dev dependency and Chromium (`pnpm exec playwright install chromium`).
- `fixtures/head/head-parity.json`: one corpus both runtimes read, so the head after a dynamic navigation and the head of a document load are held to the same expected head.

## [0.5.0-beta.2] - 2026-09-24

### Changed

- `ControllerExtensions.PoyoPage(data)` is the only controller Page data seam. It now accepts only a JSON object or `null`; C# objects serialize with camelCase names, JSON object strings are preserved, and caller-owned `JsonElement` values are cloned.
- `HtmlHelperExtensions.PoyoPageData()` owns document embedding. It emits nothing for absent data and serializes present data with `JavaScriptEncoder.Default`, preserving the same structural value returned as descriptor `pageData` for one controller-produced result.
- Navigation descriptor requests check view availability without executing Razor. A missing view returns 404, and successful document and descriptor representations carry structurally equal Page data when given the same controller-produced value; a later request can refresh time-varying fields.
- Conventional controller aliases now resolve the matched registry route for access and SEO enforcement.
- `PageResult.For` retains its public pre-serialized string API while centralizing object validation and `JsonElement` cloning at the factory boundary.
- Document Page data is emitted as an encoded JSON string parsed with `JSON.parse`, preserving special property names such as `__proto__`.

### Removed

- View-authored `ViewBag.ServerData`, raw layout script embedding, and HTML text scraping are no longer supported. Existing projects must move each view-authored payload into a controller action that returns `this.PoyoPage(data)`, map the registry route to that action, add `@using Poyo.Framework` to `Views/_ViewImports.cshtml`, and replace the raw layout script with `@Html.PoyoPageData()`.

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

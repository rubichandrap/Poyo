# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Security

- The Routes registry is a required deployment artifact and the server core treats it as one (ADR 0014). A registry that is missing, empty, unreadable, or unparseable now fails startup with a message naming which of the four it was, instead of booting an application whose access model, SEO policy, and `private, no-store` guarantee were all switched off by the same missing file. A registry that declares no routes is a startup failure.
- Registry resolution no longer reads the process working directory — in ASP.NET it is also the default content root, so a deployment's access model no longer depends on the directory its host happened to start it in. `AddPoyo(configuration, registryPath?, contentRootPath?)` resolves the registry from the explicit argument, then `Routes:JsonPath` configuration (a relative value resolves against the content root), then `routes.json` beside the application assembly, then a hard failure. Ship the registry beside the application so a published output boots from any working directory.
- Poyo-owned page responses now emit `Cache-Control: private, no-store`: HTML documents, navigation descriptors, access challenges, guest redirects and page errors. `Vary: X-Poyo-Navigation` is retained as the representation selector. Because the directive applies to every document, main documents are no longer eligible for the browser's back/forward cache, so cross-document Back/Forward refetches instead of restoring instantly (ADR 0013).
- The template's cookie-mutating login, refresh and logout responses apply the same policy through the project-owned `[PrivateNoStoreResponse]` filter. Unrelated API responses are unaffected.
- The conventional `controller/action` URL of a page route is no longer served, which closes a privacy hole in the server core's contract. The access filter resolved a route by path *or* by controller and action, so a conventional URL could be served a page by an action no registry route authorized. The filter's route was the only one that resolved: the page result saw none, so such a URL answered no navigation descriptor, set no `Vary: X-Poyo-Navigation`, and rendered through an action the registry never authorized — probed against the template registry, an anonymous `/Page/Index` returned 500 because the view path and the route were both null. A URL whose controller and action no registry route named got no access model and no `private, no-store` at all. `MapPoyoRoutes` documents that a host which also maps a conventional controller/action route publishes a second URL for every controller the registry names, and that the registry is the single source of truth for route existence (ADR 0016).

### Changed

- **Contract change:** a field has exactly one accepted spelling in the registry, and the server enforces it (ADR 0018). The deserializer's property matching is case-insensitive because that is how a lower camel case registry maps onto a PascalCase model, which meant `{"Path": "/Home"}` and `{"Access": "public"}` booted while the route manager refused them — two spellings for one field across the three runtimes that read the registry. `RoutePolicy` now checks a field's name, a route's required `files` members, and the `access`/`dynamic` values on the raw JSON before the deserializer: a mis-cased member is an unknown member, a route with no `files` or no `files.view` is a startup failure rather than a null reference when the routes are mapped, and an `access` that is not one of the three values is reported against the route rather than a JSON path. A registry that already booted with a mis-cased member now fails to start, and the message names the member and the route. Only presence and type of a file path are checked: a blank one is still the route manager's rule, because a file path is not a route's identity (ADR 0015).
- **Contract change:** a `dynamic` field spelled with the wrong case is reported for its value, with the spelling it was written in. The pre-check's lookup was case-sensitive, so a mis-spelled field was missed entirely and the deserializer's generic `is not a valid routes registry` failure answered instead — the one message naming neither the field nor the route.
- The registry's rules are now held to one shared corpus, `fixtures/registry/`, read by this package's suite and by the server's. A registry and the verdict it earns, one file per rule, so a rule added to one runtime and not the other fails a test rather than a review. A case declaring one verdict for the two also pins the message fragments both messages must carry; a case declaring a verdict per runtime pins a deliberate difference, of which there are four today: the empty registry, which this package reads and writes legitimately and the server refuses to boot on (ADR 0014), a `seo` member the model does not know, which only the server refuses, and the two halves of the file-path boundary the two runtimes draw differently — ADR 0018 names each. The route manager's failure messages now name the route they are about wherever the route is readable, including a route with no readable `path`, which is named by its name instead; a blank or unrooted `path` is one rule rather than two, and an array is refused where an object is required. An authored `"seo": null` is no longer refused: it is read as "no SEO" by the same rule this package already followed for `"controller": null`, which the shared corpus found was the one field whose meaning the two runtimes disagreed about.
- **Contract change:** one lookup resolves every request (ADR 0016). `RoutePolicy.Find`, by normalized request path, is the only way a server seam answers "which route serves this request" — the access filter, the SEO filter, `PageController`, and `ControllerExtensions.PoyoPage` all ask it. The controller/action lookup and its access-priority ordering are removed, along with the list-order tie-break between routes that share a defaulted controller: they existed only to resolve a conventional URL backwards into the registry, and with the conventional URL unreachable they had no legitimate caller. `RoutePolicy.FindForRequest` is removed from the public server core; a consumer calling it must call `Find` with a request path.
- **Contract change:** a route's identity is one thing, defined once, and the declared registry is held to it at boot (ADR 0015). A path must begin with a slash and carry no trailing slash except for the root; a name must be present and carry no leading or trailing slash; both must be unique across the registry ignoring case; a controller and an action are declared together or not at all, and neither may be blank. Every violation is a `RoutePolicyException` startup failure naming the offending route and value, never a warning. A registry that booted under the weaker rules — a non-canonical path, a blank name, a slash in a name, a duplicate name, a lone or blank controller or action — now fails to start, and each fix is stated in the message. Duplicate-path detection compares normalized paths, so two declarations differing only by a trailing slash collide rather than being served in declaration order.
- **Contract change:** requests are still matched liberally against that strict file. `RoutePolicy.Find` normalizes an incoming path (trailing slashes trimmed, the root preserved) and compares case-insensitively, so `/settings`, `/Settings` and `/Settings/` resolve to the declared route. `RoutePolicy` keeps its ordered `Routes` list — declaration order still drives error messages and endpoint registration — and looks requests up through a normalized-path index; `RouteIdentity` is the single place the canonical form, the uniqueness rules, and the request-path normalization are defined.
- **Contract change:** `poyo` validates the same declared-path, name, and controller/action rules on every read and write of the registry, so an invalid registry is rejected when it is authored rather than when it is deployed. The route manager refuses a non-canonical path rather than normalizing it, so the generated route manifest can only ever hold a canonical path — a trailing-slash URL can no longer reach the typed `RoutePath` union or rendered link markup. Two JSON readings follow the server, so the CLI and the boot accept the same registries: an absent `access` is its documented `protected` default rather than a refusal, and a `"controller": null` is *undeclared* rather than a declaration that is blank. A file path is not a route's identity and the server never checks one, so the route manager does not import the identity notion of blank into it.
- **Contract change:** `RoutePolicy.Load(path)` throws `RoutePolicyException` for a missing file and for an empty registry where it previously returned an empty route policy, and a registry that is neither well-formed JSON nor a valid schema now says `is not a valid routes registry` rather than claiming the text is not JSON. A consumer that called the loader directly, or that booted with no registry at all, must ship one.
- **Contract change:** the default registry resolution in `AddPoyo` no longer ends at the process working directory; it ends at the application installation directory. A consumer that passed no explicit path and relied on the working directory must name the location (or ship the registry beside the application).
- `AddPoyo` takes an optional `contentRootPath`, which resolves a relative `registryPath` or `Routes:JsonPath`.

### Breaking changes

Public server-core API in this release. `@rubichandrap/poyo` is pre-1.0, so these ship in a minor; a consumer pinning the previous version and taking this one must change code.

- `RoutePolicy.Load(path)` now throws `RoutePolicyException` for a missing file, an empty file, an empty registry, and a registry that is unreadable, where it previously returned an empty route policy. An empty policy is not a degraded mode — the access model, the SEO policy and the `private, no-store` guarantee are all gated on the registry answering for the request, so one missing file switched all three off and a protected page became reachable. Ship a registry, or pass a path to one.
- `RoutePolicy.FindForRequest(path, controller, action)` is removed. Call `RoutePolicy.Find(path)`: route resolution is by request path only, and the conventional `controller/action` URL for a page route is no longer served (ADR 0016).
- `RouteIdentity.Validate(RouteDefinition, string)` is no longer public; validate a whole registry with `RouteIdentity.Validate(IReadOnlyList<RouteDefinition>, string)`.

### Fixed

- A registry the process cannot reach is reported as unreachable rather than missing. `File.Exists` answers false for any stat failure, not only for an absent file, so a registry inside a directory the process cannot enter was reported "was not found" — the one diagnosis that sends an operator looking for a file that is already there, in a directory that is already there. Enumerating the directory is what tells the two apart: a directory that is not there is the ordinary missing case and keeps its message, and only a path that exists and cannot be entered is a permission problem.
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

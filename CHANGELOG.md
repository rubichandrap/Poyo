# Changelog

All notable changes to the Poyo monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Fixed

- `poyo build` fails naming the files when the Vite manifest lists assets the client build did not produce, instead of copying whatever is there and shipping a page whose script or stylesheet 404s.
- `poyo build` emits the stylesheet of every chunk the entry imports statically, not only the entry's first CSS file.
- The CLI strips only the first `--` in its arguments, the one pnpm forwards before the user's, so a `--` the caller passed later reaches the command.
- `create-poyo-app` launches `pnpm install` through a shell only on Windows, so a Windows scaffold no longer fails after copying the template, and no platform sees Node's shell-argument deprecation warning (DEP0190).
- CI runs the framework and scaffolder suites on Windows and on the lowest Node version `engines` allows; the fixes those runs needed are tests that assumed a POSIX separator, `/tmp`, or a shell shim.
- A Poyo page response keeps any `Vary` value already on it (CORS or response compression, for one) and adds `X-Poyo-Navigation` to that value instead of replacing the header. A registry route whose view file is missing answers a descriptor request the way the document does: a logged 500 through the exception handler, not an empty 404. **Upgrading:** none.

### Changed

- `wwwroot/manifest.json` records `css` as an array, not a string or `null`. **Upgrading:** a consumer that reads that field as a string must read an array.
- A route path may no longer declare route-template or URL syntax — `{`, `}`, `*`, `?`, `#`, or a `%` other than `%2F` (ADR 0015). Such a path was mapped as an ASP.NET route template but resolved literally, so `/Users/{id}` served `/Users/42` and skipped access, SEO and `no-store`. **Upgrading:** correct such a registry or it will not boot.
- A route's `files.react` and `files.view` must stay inside the project: a `..` segment, an absolute path or a drive-rooted path is refused by the server and every route command, and the route manager resolves and checks each file before it writes or deletes one (ADR 0022). **Upgrading:** a registry declaring one now fails to start until the path is corrected.

## [0.7.1] - 2026-11-17

### Fixed

- A scaffolded project no longer inherits the template's `repository`, `homepage`, `bugs` or `keywords`; the rename had turned the repository URL into `github.com/rubichandrap/<Project>`, which does not exist. **Existing projects:** delete those fields from the root `package.json`.

### Changed

- The packages declare npm `keywords`, `homepage` and `bugs`, so npm search and the package pages show them.
- Superseded ADR text moved to `docs/adr/archive/` with a pointer in each ADR (0005, 0007, 0009, 0011), and long changelog entries were shortened to what changed and what to do.

## [0.7.0] - 2026-11-17

### Changed

- A route path may no longer declare an empty or dot (`.`/`..`) segment, the percent-encoded `%2e` spellings included, since the URL parser reads those as dots, nor hold a backslash, which a browser reads as `/` (ADR 0015). **Upgrading:** a registry declaring one now fails to start until its path is corrected.
- The scaffolder protects framework identifiers by rule, not by a hand-kept list: a `Poyo` immediately followed by an uppercase letter (`PoyoPage`, `PoyoPageData`, a future `PoyoHost`) survives the rename verbatim, so adding an entry point to the framework no longer needs a scaffolder change.
- The framework owns the host bootstrap (ADR 0021). The server project must reference DotNetEnv, and the build guard names the package when it does not. **Existing projects keep compiling and behaving as they do;** the `poyo-template` changelog names the `Program.cs` blocks the call replaces.
- The framework also applies the path base (ADR 0021). **Upgrading:** replace the `PathBase` block (`string? pathBase = builder.Configuration["PathBase"];` and the `if` around `app.UsePathBase(pathBase);`) with `app.UsePoyoPathBase();` in the same position; the `poyo-template` changelog carries the exact note.

## [0.6.0] - 2026-11-17

### Added

- Views can add SSR-only head elements (canonical, hreflang, preload) with `@section Head`; `_Layout.cshtml` renders it at the end of `<head>`. Mark them `data-poyo-seo` so a dynamic navigation away removes them; a navigation descriptor never runs the view (ADR 0020). Existing projects: add `@await RenderSectionAsync("Head", required: false)` before `</head>` in their layout.
- CI: `.github/workflows/ci.yml` runs every workspace gate on each pull request and push to `main` — lint and format, client checks, `release:check`, the framework and scaffolder suites, the navigation model check at depth 7, the server tests (which must leave the tracked tree unchanged), and the platform-facts, clean-checkout and packed-tarball checks in Chromium.

### Changed

- **Boot-time check:** `Routes:LandingPath` is validated against the registry when the registry has a guest route (ADR 0004 amendment). **Upgrading:** a project with guest routes and no `/Dashboard` route must set `Routes:LandingPath` to a non-guest route (or an absolute URL), or it will not start.
- `PageResult.For` is internal. Controllers author pages through `this.PoyoPage(data)`; the server core compiles into the application's assembly, so existing calls still compile, but the factory is no longer a supported API.

### Fixed

- A published application serves its assets whatever directory the host starts it from. **Existing projects:** apply the `Program.cs` change (`WebApplicationOptions.ContentRootPath`) from the template (ADR 0014 amendment).
- Back/Forward returns to the position an entry was left at even when it was left within a frame of the last scroll (ADR 0019 decision 7).
- `router.push("#x")` and `router.replace("#x")` (or `/same-page#x`) are the browser's own fragment navigation, as an in-page anchor is, instead of a descriptor request, a second commit of the page on screen, a history entry and a scroll to the top (ADR 0019 decision 8).
- A Back/Forward to a fragment entry (`/page#section`) whose descriptor cannot be answered now reloads the entry.
- `poyo route update` re-emits `routes.generated.ts` even when the update changes nothing, as every other route command does.
- The OpenAPI snapshot export no longer rewrites `poyo.client/openapi/openapi.json` when the API has not changed. The committed file is formatted by the repository's formatter, so every Development boot left a whitespace-only diff; a semantically equal document is now left alone. The server test suite also exports to a temporary path instead of the source tree.

## [0.5.1] - 2026-11-17

### Fixed

- The scaffolder no longer accepts a project name the generated server cannot compile under, such as `Task`, `Environment`, `Path` or `Exception`: the name becomes the root namespace and hides the type. The list is derived from the shipped C#, so a few ordinary words (`Dashboard`, `Login`) are refused too.
- Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, `LPT0`–`LPT9`, any case) are refused as project names: they scaffolded on Linux and macOS but cannot be a directory on Windows.
- A Back/Forward scroll restore no longer lands on a newer page (ADR 0019 decision 6).
- **Behavior change:** under a path base, an app path is prefixed exactly once. Code that passed an already-resolved browser URL (for example `location.pathname`) to `router.push` or `withBasePath` must pass the app path instead, as the contract already said.

### Changed

- ADR 0011 is amended: TypeScript returned to `5.9.3` in 0.5.0-beta.4 and the peer suppression was removed, which reversed its decisions 1, 3 and 4 without saying so. Decision 2 (no `baseUrl`) stands.
- The 0.5.0 and 0.5.0-beta.4 changelog sections were empty and their entries filed under 0.5.0-beta.3. The clean-checkout, project-name, TypeScript-pin and license entries now sit under beta.4 and the subpath-deployment entries under 0.5.0.

## [0.5.0] - 2026-11-17

### Added

- Subpath deployment is supported end to end: set `PathBase`, and asset tags, `data-base-path`, API calls, navigation and the auth challenge all resolve under it. The browser check runs at `/` and at `/Poyo`.

## [0.5.0-beta.4] - 2026-11-17

### Added

- A clean clone can run the documented template commands.
- The scaffolder accepts a project name only when it can be a C# namespace segment, an npm package name and one directory name at once (`^[A-Za-z][A-Za-z0-9_]{0,63}$`).
- Every TypeScript pin is `5.9.3`, inside `openapi-typescript`'s declared `typescript` peer range; the `pnpm.peerDependencyRules.allowedVersions` suppression that hid the conflict is gone, and `pnpm run release:check` runs a peer gate that reads the versions pnpm actually resolved. The range model lives in `scripts/peer-ranges.mjs`.
- Every package manifest declares `"license": "MIT"` and carries its own `LICENSE`. npm renders the license from the manifest field, not from the file in the tarball, so the published packages previously showed no license.

## [0.5.0-beta.3] - 2026-11-17

### Security

- The process environment now owns the hosting environment, and an environment file is a development convenience (ADR 0017).
- The Routes registry is a required deployment artifact and the server treats it as one (ADR 0014).
- Registry resolution no longer reads the process working directory — in ASP.NET it is also the default content root, so a deployment's access model no longer depends on the directory its host happened to start it in.
- Poyo-owned page responses now emit `Cache-Control: private, no-store`: HTML documents, navigation descriptors, access challenges, guest redirects and page errors (ADR 0013).
- The template's cookie-mutating login, refresh and logout responses apply the same policy through the project-owned `[PrivateNoStoreResponse]` filter. Unrelated API responses are unaffected.
- The conventional `controller/action` URL of a page route is no longer served, which closes a privacy hole (ADR 0016).

### Changed

- **Breaking:** `usePage()` follows React's hook rules now that it subscribes to the store, so it must be called while a component renders. Read Page data elsewhere with `getPageData()`.
- The template resolves app URLs through the runtime: `Link` takes `routePath()` results directly, full-page redirects use `withBasePath()`, and the build-time `appUrl()` helper (`src/lib/base-url.ts`) is gone. The Dashboard logout no longer redirects to the host root under a base path.
- **The registry's rules are proven equivalent across the server and the route manager (ADR 0018).** A shared corpus at `fixtures/registry/`, read by both test suites, pins each rule's verdict and the message fragments both runtimes must carry. A validation rule lands with its corpus case.

- One lookup resolves every request (ADR 0016): `RoutePolicy.Find`, by normalized request path, is the only way a server seam finds its route.
- A route's identity is one thing, defined once, and the declared registry is held to it at boot (ADR 0015): a path must begin with a slash and carry no trailing slash except for the root, a name must be present and carry no leading or trailing slash, both must be unique across the registry ignoring case, and a controller and an action are declared together or not at all, neither blank.
- Requests stay liberal against that strict file: an incoming path is normalized (trailing slashes trimmed, the root preserved) and matched case-insensitively, so `/settings`, `/Settings` and `/Settings/` all serve the declared `/Settings` with the same status, page name and privacy headers. A request URL is owned by the browser; a declaration is not.
- **Operator migration:** a value you added to a production `.env` reverts once the file stops being read outside development, and a green boot does not prove the migration is complete. Move every key that is not in `.env.example` onto the host before setting `ASPNETCORE_ENVIRONMENT=Production`.
- The supported host mechanisms, by name: a service manager `EnvironmentFile=`, `docker run --env-file`, IIS `web.config` `environmentVariables`, or an `appsettings.Production.json`.
- The environment file now fills gaps without ever overriding a value the process already has set.
- The Vite variable requirements and the port-integrality gate are development requirements and now run only in development, so a production host needs no Vite variables.
- The server bootstrap no longer derives a directory from the working directory, which removes the null-forgiving dereference that threw when the working directory was the filesystem root. Development launches get their values — the project-root registry and the optional `.env` — from `Poyo.Server/Properties/launchSettings.json`, so a run-from-source launch works with no environment file present.
- The template's `README.md` gains an "Upgrading an existing deployment" procedure: the `.env` diff to run, the values to expect, and why a green boot is not evidence the migration is complete.
- The four changelogs are reconciled with what shipped, each at its own altitude.
- The registry's deployment guidance now calls it a security control as well as a required artifact, and states each registry failure state as the message an operator reads it by — not there and cannot reach are separate diagnoses, an empty file and a registry that declares no routes are separate, and a schema violation reports the offending member.
- The property-name case question is decided and recorded (ADR 0018), along with where a corpus shared by `packages/poyo` and `packages/poyo-template` lives and why a generated rule table was rejected.

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
- A client-initiated `router.replace()` that cannot fetch a descriptor now degrades to a document load through `location.replace` instead of `location.assign`, so a failed replacement no longer adds a history entry; `push()` still degrades through `location.assign`.
- A registry the process cannot reach is reported as unreachable rather than missing.
- A registry that is neither well-formed JSON nor a valid schema now reports `is not a valid routes registry` rather than claiming the text is not JSON. `RouteDefinition` is a positional record, so a schema violation surfaces as the same exception, and "not valid JSON" was untrue for it.
- The claim that registry resolution "never consults the process working directory" was true only of the default branch, and is now stated per branch. A relative `Routes:JsonPath` resolves against the content root, which in ASP.NET *is* the working directory, so a relative override inherits it — by the operator's own instruction, rather than by the framework's choice.
- The `poyo` route manager refuses the same registries the server refuses. An absent `access` is its documented `protected` default rather than a refusal, and a `"controller": null` reads as undeclared rather than as a declaration that is blank, so the CLI and the boot accept the same registries.
- A registry field has one accepted spelling on the server too: field names, required members and the `access`/`dynamic` values are checked on the raw JSON, so a mis-cased member is refused at boot with the route named.
- A `dynamic` field spelled with the wrong case reported *"is not a valid routes registry"* instead of the dynamic-field message.
- Every registry failure the server reports now names the offending route, not a position in the JSON.
- The route manager reads a blank or unrooted `path` as one rule rather than two, and refuses an array where an object is required.
- The route manager no longer refuses an authored `"seo": null`, which the server serves. It is the same reading it already followed for `"controller": null` — a null is a declaration of absence, not a declaration nothing can act on — and it was the only case the shared registry corpus found where the two runtimes disagreed about one field's meaning.
- A descriptor request that the server answers with a redirect no longer commits the redirect target's page.
- Dynamic descriptor requests state `credentials: "same-origin"` explicitly. This matches the `fetch` default and changes no network behavior.
- A Back/Forward traversal that cannot fetch a descriptor now hands the URL back with `location.replace` instead of `location.assign`, so the document load settles the entry the browser already moved to rather than risking a history entry that was never rendered.
- Two claims that had no test behind them are now pinned at the published-application seam: a deployment that loses `Routes:JsonPath` serves a *different* access model than the one its host named, and the publish output carries no environment file.


### Added

- The page descriptor carries a format version, `"v": 1`. A client refuses a version newer than it understands and falls back to a document load; a descriptor without `v` is read as version 1.
- `getPageData()` reads Page data outside a component render (event handlers, utilities, tests). `usePage()` is the hook components call.
- `pnpm run test:release:prepublish` runs the fixture project against the tarball `pnpm pack` produces, including a real-browser check of Link, Back and Forward (`scripts/browser-navigation.mjs`). The release workflow runs it before publishing, so a broken release is caught before it is public. It needs `playwright` as a root dev dependency and Chromium (`pnpm exec playwright install chromium`).
- `fixtures/head/head-parity.json`: one corpus both runtimes read, so the head after a dynamic navigation and the head of a document load are held to the same expected head.

## [0.5.0-beta.2] - 2026-09-24

### Changed

- Page data has one authoring seam: controller actions return `this.PoyoPage(data)`, while default registry routes have no Page data. The seam accepts a JSON object or `null`; for the same controller-produced value, document `window.SERVER_DATA` and navigation descriptor `pageData` are structurally equal.
- The framework-owned `@Html.PoyoPageData()` helper safely embeds document Page data with `JavaScriptEncoder.Default`, emits no script when data is absent, and prevents HTML-sensitive characters from terminating the script element.
- Navigation descriptor requests no longer execute Razor views to scrape Page data, and a missing Razor view now returns 404 before a descriptor is advertised.
- Conventional controller aliases now resolve the matched registry route for access and SEO enforcement.
- `PageResult.For` retains its public pre-serialized string API while centralizing object validation and `JsonElement` cloning at the factory boundary.
- Document Page data is emitted as an encoded JSON string parsed with `JSON.parse`, preserving special property names such as `__proto__`.

### Removed

- View-authored `ViewBag.ServerData` and the raw `@Html.Raw` layout script are no longer a supported Page data channel.


## [0.5.0-beta.1] - 2026-09-24

### Fixed

- The scaffolder escapes `actionName` before interpolating it into the controller-action regex, so controller names with regex metacharacters no longer trigger regular expression injection (CodeQL alert no. 1)
- `GlobalExceptionHandler` strips CR/LF from the request path and query before logging the unhandled-exception URL, closing the log-injection vector (CodeQL alert no. 2)

## [0.5.0-beta.0] - 2026-09-23

### Added

- Dynamic navigation (ADR 0009): `useRouter()`/`createRouter` from `@rubichandrap/poyo/runtime/router` and `<Link>` from `@rubichandrap/poyo/runtime/link` swap only the page component below the loaded shell, so client state survives navigation. Browser Back/Forward traverse the same way with scroll restored per history entry; every failure degrades to a document load of the same URL.
- The C# server core ships inside `@rubichandrap/poyo` under `server/` (ADR 0008) and compiles into the server project in place through the csproj — `AddPoyo()`, `MapPoyoRoutes()`, `PageResult`, and `ControllerExtensions.PoyoPage()`. Server-side framework fixes now arrive with `pnpm update @rubichandrap/poyo`; no NuGet package, no copied framework files.
- Registry `dynamic` field (optional boolean, default `true`): `"dynamic": false` opts a route out of dynamic navigation, answered as the document even for a navigation request. Validated by the CLI on every read and by the server's boot validation, both naming the route on a malformed value.
- Encapsulated route manifest (ADR 0010): `routes.generated.ts` becomes an ambient type augmentation imported by no one, while `routePath()`, `RouteName`, and `RoutePath` ship from the runtime and resolve from the active route table. The manifest is gitignored again.
- Navigation descriptor wire contract: a request carrying `X-Poyo-Navigation: 1` is answered with JSON `{ name, seo, pageData }` and `Vary: X-Poyo-Navigation`; access enforcement runs first, so a protected route's descriptor challenges anonymous callers instead of leaking its payload.

### Changed

- The template's client `index.html` is gone: the Razor views own every document and the Vite build entry is the client module itself (`src/main.tsx`); `poyo build` keeps syncing only manifest-referenced assets.
- Generated projects no longer carry frozen copies of the server framework code (`Routing/`, `Controllers/PageController.cs`); the server csproj compiles the installed package's `server/` sources and fails with a "run `pnpm install`" error when the package is missing.
- The template's `Register` route ships `"dynamic": false` as the worked opt-out; template pages use `<Link>` and the runtime `routePath()` helper.

## [0.4.1] - 2026-09-08

### Fixed

- Template ships `.gitignore.template` and `poyo.client/.gitignore.template` to prevent npm/pnpm packaging from stripping `.gitignore` files during release
- Scaffolder restores `.template` files (`.gitignore.template` → `.gitignore`) across the scaffolded project tree
- Generated root `.gitignore` dynamically sets `<Project>.Server/wwwroot/...` paths for React build assets instead of hardcoding `Poyo.Server`
## [0.4.0] - 2026-08-20

### Added

- Committed client route table: `routes.generated.ts` is committed at the client package root (`<client>/routes.generated.ts`) and un-ignored from `.gitignore`, eliminating TypeScript errors on fresh clones/scaffolds before the first build
- Offline OpenAPI codegen: `poyo generate` generates TypeScript DTOs and Zod schemas offline from the committed `<client>/openapi/openapi.json` snapshot without requiring a running server; `dtos.generated.ts` and `validations.generated.ts` are gitignored
- In-process OpenAPI snapshot export: `Poyo.Server` exports its OpenAPI document directly to `<client>/openapi/openapi.json` during development/staging boot via `OpenApiSnapshotExportHostedService` without network loopback requests
- Scaffolder environment bootstrap: `create-poyo-app` automatically bootstraps `.env` from `.env.example` during project scaffolding, substituting the project name
- Fixture E2E first-run validation: the release fixture verifies offline scaffold, offline codegen, offline typecheck and build, in-process snapshot export, and served page hydration attributes

### Changed

- In `poyo-template`, `dev` is aliased directly to `server:watch` (`dotnet watch` with Vite proxy) and `dev:watch` is removed
- Removed circular-deadlock `"predev": "poyo generate"` hook from `poyo.client/package.json` so `pnpm run dev` and `dotnet watch` boot without locking Vite server proxy
- Scaffolder post-scaffold prompt updated to `pnpm run restore && pnpm run generate && pnpm run dev` so offline validation schemas are generated before booting
- Documentation updated to recommend `create-poyo-app@latest` and document the `pnpm run generate` workflow

## [0.3.1] - 2026-08-16

### Fixed

- The published `create-poyo-app` resolves `@rubichandrap/poyo-template` as the release version instead of the raw `workspace:*` protocol — 0.3.0 shipped the leak (npm publish does not rewrite workspace deps; pnpm publish does) and standalone installs (`npx`/`pnpm dlx`) failed with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`.

## [0.3.0] - 2026-08-16

### Added

- Client runtime subpath: `usePage` ships from `@rubichandrap/poyo` as `./runtime` (ADR 0005); generated projects import the accessor from the framework package, and the template's local copy is deleted
- Route resolution ships in the client runtime (ADR 0006): `createRouteTable` from `@rubichandrap/poyo/runtime`, with `poyo generate` and every route command emitting the gitignored typed route manifest (`RouteName`, `RoutePath`, `routePath()`).
- Release-time fixture e2e (`pnpm run test:release`): scaffolds a real project, installs `@rubichandrap/poyo` from npm at the release version, and asserts the resolved package and the `usePage` accessor in the built client bundle — red until the version is published (the npm-resolution proof)

### Changed

- The scaffolder pins the generated client's `@rubichandrap/poyo` devDependency to the release version at generate time (silent-skip when the template doesn't declare it)

## [0.2.0] - 2026-08-04

### Changed

- Route access model cut: the registry's `isPublic`/`isGuestOnly` flags are replaced by a single `access` field (`public` | `guest` | `protected`, default `protected`) written by the CLI, rejected as unknown when hand-edited, and enforced universally on the server via `RouteAccessFilter` (no per-action attributes).
- `PageController` collapses to a single `Index` action and `GuestOnlyAttribute` is deleted; guest behavior folds into the registry policy. Home becomes a normal registry route (`access: guest`, SEO in the registry) and `HomeController` is removed; the fallback route loses its Home defaults so unmatched URLs get clean 404s.

### Fixed

- `Microsoft.OpenApi` pinned to 2.7.5 in the template (GHSA-v5pm-xwqc-g5wc)
- `pnpm run <script> -- <args>` invocation no longer mis-parses flags after `--` (pnpm forwards the `--` token itself)
- Generated projects now ship a `pnpm-workspace.yaml`, so `pnpm install` covers the client and server workspaces

## [0.1.1] - 2026-08-03

### Fixed

- Empty readmes on npm: none of the three packages shipped a `README.md` in its own directory, and npm renders the readme from the package directory, not the monorepo root. Added package-local `README.md` files to `@rubichandrap/poyo-template`, `@rubichandrap/poyo`, and `@rubichandrap/create-poyo-app`, and added a release-workflow guard that fails the build if any package publishes without one.

## [0.1.0] - 2026-08-03

### Added

- pnpm workspace monorepo with three lockstep packages: `@rubichandrap/poyo-template`, `@rubichandrap/poyo`, `@rubichandrap/create-poyo-app`
- `poyo` project CLI: route management (`route add/update/remove/sync`), build asset sync (`build`), and OpenAPI code generation (`generate`)
- `create-poyo-app` scaffolder: creates a generated project from the template package
- Lockstep release pipeline: tag-triggered GitHub Actions workflow that asserts all three package versions match the tag, publishes to public npm via `pnpm publish` with an `NPM_TOKEN` secret, and creates a GitHub Release from the changelog
- `scripts/assert-release-version.mjs` + `release:check` for verifying lockstep versions

### Changed

- Route, build, and codegen tooling moved from repo-root scripts into the `poyo` project CLI
- Route management moved from the Go CLI back to TypeScript (lazy-loaded deps keep startup fast)

### Removed

- All Go tooling (`tools/poyo/`, `poyo`, `poyo.ps1`)
- The stale GitHub-Packages `publish.yml` workflow
- The old whole-repo-copy scaffolder (`cli/create-poyo-app.js`)

[0.5.0-beta.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.5.0-beta.0
[0.4.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.4.0
[0.3.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.1
[0.3.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.0
[0.2.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.2.0
[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

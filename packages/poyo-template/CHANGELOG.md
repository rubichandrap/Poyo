# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

## [0.8.0] - 2026-11-18

### Fixed

- The logout resolves the app root through the client base path, so a project mounted under `PathBase` lands on its own root, and Dashboard now calls the auth provider's `logout()` (clearing `ui-token` and the user state) instead of duplicating the redirect. **Upgrading:** in `providers/auth-provider.tsx`, redirect to `withBasePath("/")` instead of `"/"`.
- The demo cookie is `SameSite=None` and the credentialed `AllowClient` CORS policy is registered only in Development; every other environment uses `SameSite=Lax` and no CORS policy, so no response grants a cross-origin credential. **Upgrading:** gate the cookie's `SameSite` and the `AddCors`/`UseCors` blocks on `builder.Environment.IsDevelopment()`.
- The template no longer ships the `StaticData` view that only the server tests used, so a generated project's first `poyo route sync` reports nothing to sync. **Upgrading:** delete `Views/StaticData/Index.cshtml` from an existing project if nothing serves it.

### Changed

- The Login page links to the `dynamic: false` demo route, Register, so the template carries a `Link` that is a document load by design. **Upgrading:** none.

## [0.7.1] - 2026-11-17

### Changed

- Declares npm `keywords`, `homepage` and `bugs`. No behaviour change.

## [0.7.0] - 2026-11-17

### Changed

- The framework owns the host bootstrap (ADR 0021). `Program.cs` now starts with `WebApplicationBuilder builder = PoyoHost.CreateBuilder(args);` instead of reading the environment and creating the builder itself; the behaviour moved unchanged into the server core, so fixes to it arrive with `pnpm update @rubichandrap/poyo` rather than as a `Program.cs` edit. **Existing projects keep compiling and behaving as they do.** To adopt the call, make four edits in this order. First, remove the `using DotNetEnv;` directive; keep `using Poyo.Framework;`. Second, remove the hosting-environment block: the `DOTNET_ENVIRONMENT` and `ASPNETCORE_ENVIRONMENT` reads, the `EnvFile` load with `LoadOptions.NoClobber()`, the post-load clear of both names, and the `IsUnsetOrDevelopment` local function. Third, keep `RequireEnv` and the development checks that call it. Fourth, in the body, replace the `hostNamesContentRoot` and `workingDirectoryHoldsTheApplication` checks together with the `WebApplication.CreateBuilder(new WebApplicationOptions { … })` call with `WebApplicationBuilder builder = PoyoHost.CreateBuilder(args);`. Keep the DotNetEnv `PackageReference` in the server project. Authentication and the demo cookie scheme, authorization, application services, the exception handler, CORS, the Vite services and development-variable checks, the OpenAPI document and its snapshot export, HTTPS redirection, `AddPoyo` and `MapPoyoRoutes` stay in the project. The build guard now fails with a message naming the package when the DotNetEnv reference is missing.
- The framework applies the path base (ADR 0021). `Program.cs` now calls `app.UsePoyoPathBase()` in the same middleware position its own `PathBase` block occupied — after `WebApplication app = builder.Build();` and before `app.UseDefaultFiles()` and static files. The server core reads `PathBase` once and applies `UsePathBase` only for a non-blank value, so a root deployment is unchanged, and a project that keeps its own `UsePathBase` block keeps working. **Existing projects keep behaving as they do.** To adopt the call, replace

  ```csharp
  string? pathBase = builder.Configuration["PathBase"];
  if (!string.IsNullOrWhiteSpace(pathBase))
  {
      app.UsePathBase(pathBase);
  }
  ```

  with `app.UsePoyoPathBase();`, keeping the position: before `UseDefaultFiles`, static files and routing. Do not move the call below them.

## [0.6.0] - 2026-11-17

### Added

- Views can add SSR-only head elements (canonical, hreflang, preload) with `@section Head`; `_Layout.cshtml` renders it at the end of `<head>`. Mark them `data-poyo-seo` so a dynamic navigation away removes them; a navigation descriptor never runs the view (ADR 0020). Existing projects: add `@await RenderSectionAsync("Head", required: false)` before `</head>` in their layout.

### Changed

- **Boot-time check:** `Routes:LandingPath` is validated against the registry when the registry has a guest route (ADR 0004 amendment). **Upgrading:** a project with guest routes and no `/Dashboard` route must set `Routes:LandingPath` to a non-guest route (or an absolute URL), or it will not start.

### Fixed

- A published application serves its assets whatever directory the host starts it from. **Existing projects:** apply the `Program.cs` change (`WebApplicationOptions.ContentRootPath`) from the template (ADR 0014 amendment).
- (runtime) Back/Forward returns to the position an entry was left at even when it was left within a frame of the last scroll (ADR 0019 decision 7).
- (runtime) `router.push("#x")` and `router.replace("#x")` (or `/same-page#x`) are the browser's own fragment navigation, as an in-page anchor is, instead of a descriptor request, a second commit of the page on screen, a history entry and a scroll to the top (ADR 0019 decision 8).
- (runtime) A Back/Forward to a fragment entry (`/page#section`) whose descriptor cannot be answered now reloads the entry.
- The OpenAPI snapshot export no longer rewrites `poyo.client/openapi/openapi.json` when the API has not changed. The committed file is formatted by the repository's formatter, so every Development boot left a whitespace-only diff; a semantically equal document is now left alone. The server test suite also exports to a temporary path instead of the source tree.

## [0.5.1] - 2026-11-17

### Fixed

- (runtime) A Back/Forward scroll restore no longer lands on a newer page (ADR 0019 decision 6).
- (runtime) **Behavior change:** under a path base, an app path is prefixed exactly once. Code that passed an already-resolved browser URL (for example `location.pathname`) to `router.push` or `withBasePath` must pass the app path instead, as the contract already said.
- (0.5.0, recorded in 0.5.1) A production client build no longer carries the development server origin. `VITE_SERVER_URL` is applied in development builds only and defined away in production builds, and the release fixture asserts the dev origin is absent from the built bundle.

## [0.5.0] - 2026-11-17

### Changed

- Subpath deployment works end to end: set `PathBase` (for example `/Poyo`), and asset tags, `data-base-path`, API calls, navigation and the auth challenge all resolve inside it.
- A generated project's API calls follow the app's path base instead of the host root: the client's HTTP base URL comes from the rendered `data-base-path` when no `VITE_SERVER_URL` is configured, so a subpath deployment no longer 404s every request.

## [0.5.0-beta.4] - 2026-11-17

### Changed

- The client pins TypeScript `5.9.3`, inside `openapi-typescript`'s declared `typescript` peer range. The repo previously pinned `6.0.3` and silenced the conflict with `pnpm.peerDependencyRules.allowedVersions`, so a generated project installed with a peer warning and failed under `--strict-peer-dependencies`.

## [0.5.0-beta.3] - 2026-11-17

### Security

- The process environment owns the hosting environment, and `.env` is a development convenience (ADR 0017).
- The Routes registry is a required deployment artifact (ADR 0014): an application whose registry is missing, empty, unreadable, or unparseable now refuses to start and says which of the four it was, instead of booting with its access model, SEO policy, and `private, no-store` guarantee all switched off by the same missing file.
- Poyo-owned page responses now emit `Cache-Control: private, no-store`: HTML documents, navigation descriptors, access challenges, guest redirects and page errors (ADR 0013).
- The template's cookie-mutating login, refresh and logout responses apply the same policy through the project-owned `[PrivateNoStoreResponse]` filter. Unrelated API responses are unaffected.
- The conventional `controller/action` URL of a page route is no longer served, which closes a privacy hole (ADR 0016).

### Changed

- `_Layout.cshtml` declares its title format once (`TitleTemplate`, exposed as `<title data-poyo-title-template>`) and marks the registry-owned description, meta tags and JSON-LD with `data-poyo-seo`, so the client runtime keeps the head identical to a document load after a dynamic navigation. Projects created earlier: copy both attributes into their layout.
- A registry field has exactly one accepted spelling (ADR 0018).
- A `dynamic` field spelled with the wrong case is reported for its value, with the spelling it was written in. The pre-check's lookup was case-sensitive, so a mis-spelled field was missed and the generic `is not a valid routes registry` failure answered instead — the one message naming neither the field nor the route.
- The two runtimes' registry rules are proven equivalent rather than asserted, by a shared corpus at `fixtures/registry/` that both test suites read: one file per rule, a registry and the verdict it earns, so a rule added to the server and not the CLI (or the reverse) fails a test.
- One lookup resolves every request: a route is resolved for a request by normalized request path, through `RoutePolicy.Find`, at the access filter, the SEO filter, the page controller and `ControllerExtensions.PoyoPage` alike. A page therefore has exactly one URL — the one `routes.json` declares.
- A route's identity is one thing, defined once, and the declared registry is held to it at boot (ADR 0015): a `path` must begin with `/` and carry no trailing slash except for the root, a `name` must be present and carry no leading or trailing slash, both must be unique across the registry ignoring case, and a `controller` and an `action` are declared together or not at all, neither blank.
- Requests stay liberal against that strict file: an incoming path is normalized (trailing slashes trimmed, the root preserved) and matched case-insensitively, so `/login`, `/Login` and `/Login/` all serve the declared `/Login` with the same status, page name and privacy headers. A request URL is owned by the browser; a declaration is not.
- **Operator migration — a value you added to your own production `.env` reverts when the file stops being read, and a green boot is not evidence the migration is complete.** Those values are authoritative today precisely because the loader overrode the process.
- The environment file now loads with `LoadOptions.NoClobber()`, so it fills gaps and never overrides a value the process has already set.
- The Vite variable requirements and the `Vite__Server__Port` integrity gate run only in development, so a production host needs no Vite variables.
- `Program.cs` wires the server core with `AddPoyo(builder.Configuration, contentRootPath: builder.Environment.ContentRootPath)`. The registry resolves from `Routes:JsonPath` or from `routes.json` beside the application, never from the working directory by default; a deployment that relied on the file sitting in the working directory must ship it with the application.
- The `README.md` shipped with this template — the README of every generated project — gains an "Upgrading an existing deployment" section: the diff against `.env.example` to run before upgrading, the values to expect in the result, `Routes:JsonPath` called out as the one to check twice, the four supported host mechanisms by name, and why a green boot is not evidence the migration is complete.
- The template resolves app URLs through the runtime: `Link` takes `routePath()` results directly, full-page redirects use `withBasePath()`, and the build-time `appUrl()` helper (`src/lib/base-url.ts`) is gone. A generated project hosted under a base path links and redirects inside it instead of leaving the app for the host root.

### Removed

- `Program.cs` no longer maps the conventional `{controller}/{action}/{id?}` route, and the comment claiming it provided a clean 404 for unmatched URLs is removed with it — the claim was false; it provided a reachable page action. Unmatched paths are now answered by routing with a clean 404, before any framework filter runs.
- **Migration:** if anything links to a page route by its conventional URL — a hardcoded `<a href="/Dashboard/Index">`, a bookmark, a search result, a link in a stored email — that URL now returns 404, signed in or not.

### Fixed

- A registry the process cannot reach is reported as unreachable rather than missing.
- The claim that registry resolution "never consults the process working directory" was true only of the default branch, and the documentation now states it per branch. A relative `Routes:JsonPath` resolves against the content root, which in ASP.NET *is* the working directory, so a relative override inherits it by the operator's own instruction rather than by the framework's choice.
- A descriptor request that the server answers with a redirect no longer commits the redirect target's page.
- A client-initiated `router.replace()` that cannot fetch a descriptor now degrades to a document load through `location.replace`, so a failed replacement no longer adds a history entry; `push()` still degrades through `location.assign`. Dynamic navigation's document-load floor now preserves the history operation the caller asked for at both fallback sites, including the thrown-request path.
- Dynamic descriptor requests state `credentials: "same-origin"` explicitly. This matches the `fetch` default and changes no network behavior.
- A Back/Forward traversal that cannot fetch a descriptor now hands the URL back with `location.replace` instead of `location.assign`, so the document load settles the entry the browser already moved to rather than risking a history entry that was never rendered.


## [0.5.0-beta.2] - 2026-09-24

### Changed

- The template Dashboard demonstrates the canonical Page data path: `DashboardController.Index` returns `this.PoyoPage(dashboardData)`, and the registry maps `/Dashboard` to that action.
- `_Layout.cshtml` embeds controller-supplied Page data through the framework's `@Html.PoyoPageData()` helper. For the same controller-produced value, the document and navigation descriptor receive the same structured representation without exposing a raw script-embedding seam in application views.
- `PoyoPage` accepts a JSON object or `null`; arrays and primitives now fail at the controller seam.
- Conventional controller aliases are access-enforced through the matched registry route.

### Removed

- View-authored `ViewBag.ServerData` and inline Razor serialization are no longer shipped or supported. Existing generated projects must move each payload to a custom controller action that returns `this.PoyoPage(data)`, map the route in `routes.json`, add `@using Poyo.Framework` to `Views/_ViewImports.cshtml`, and replace the layout's raw script with `@Html.PoyoPageData()`.

## [0.5.0-beta.1] - 2026-09-24

### Fixed

- `GlobalExceptionHandler` sanitizes the request path and query string by removing CR/LF before writing the unhandled-exception log entry, preventing log injection from user-controlled input (CodeQL alert no. 2)

## [0.5.0-beta.0] - 2026-09-23

### Added

- Dynamic navigation wired through the runtime: pages import `Link` from `@rubichandrap/poyo/runtime/link` and `useRouter` from `@rubichandrap/poyo/runtime/router`, and the registry's `Register` route ships `"dynamic": false` as the worked opt-out

### Changed

- The server tree drops its frozen framework copies (`Routing/`, `Controllers/PageController.cs`): `Poyo.Server.csproj` compiles the framework's `server/` sources from the installed package (IDE `Framework` link) and fails the build with a "run `pnpm install`" error when the package is missing; `Program.cs` shrinks to `AddPoyo(...)` plus `MapPoyoRoutes()`
- The client loses its `index.html` — the Vite build entry is the client module (`src/main.tsx`) and the Razor views own every document
- The typed route manifest is gitignored again and the pages import `routePath` from the runtime instead of the generated file

## [0.4.1] - 2026-09-08

### Added

- Ships `.gitignore.template` and `poyo.client/.gitignore.template` to preserve gitignore files in published npm tarballs
## [0.4.0] - 2026-08-20

### Added

- Committed `routes.generated.ts` at `poyo.client/routes.generated.ts` (un-ignored in `.gitignore`)
- Initial OpenAPI snapshot committed at `poyo.client/openapi/openapi.json`; generated schemas (`dtos.generated.ts`, `validations.generated.ts`) gitignored
- In-process OpenAPI export hosted service in `Poyo.Server` that writes `<client>/openapi/openapi.json` on server startup in Development and Staging environments

### Changed

- Aliased `dev` script to `pnpm run server:watch` (`dotnet watch` with Vite proxy) and removed `dev:watch`
- Removed `"predev": "poyo generate"` hook from `poyo.client/package.json` to prevent circular deadlocks during server startup
- `src/routes/route-loader.ts` imports the route manifest from `../../routes.generated.ts`

## [0.3.0] - 2026-08-16

### Changed

- The client consumes `usePage` from `@rubichandrap/poyo/runtime`; the local `src/hooks/use-page.ts` and `src/types/window.d.ts` are deleted
- The route loader becomes a thin Vite-boundary adapter: route resolution ships from `@rubichandrap/poyo/runtime` (`createRouteTable`, ADR 0006), the server injects the base path (`data-base-path`), and the registry replaces the hardcoded Home fallback.

## [0.2.0] - 2026-08-04

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

[0.5.0-beta.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.5.0-beta.0
[0.4.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.4.0
[0.3.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.3.0
[0.2.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.2.0
[0.1.0]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.0
[0.1.1]: https://github.com/rubichandrap/Poyo/releases/tag/v0.1.1

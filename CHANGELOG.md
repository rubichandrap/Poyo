# Changelog

All notable changes to the Poyo monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Security

- The process environment now owns the hosting environment, and an environment file is a development convenience (ADR 0017). A deployment that sets its hosting environment correctly is no longer overridden by a `.env` file: the environment is read from the process (`DOTNET_ENVIRONMENT`, else `ASPNETCORE_ENVIRONMENT`, the order the framework itself uses) before anything else loads, so the file cannot decide the environment it is conditional on, and it is read only when the process says development or says nothing. The file never contributes the hosting environment under either name, and after it is read the process's own values are put back. A `.env` present in a production deployment cannot contribute the environment under either name, so developer exception pages, the Vite development integration, and the absence of HTTPS redirection cannot be enabled by accident — and it is not read at all once the host names the environment. An unset environment is production and does still read the file, so a deployment that forgets to set it applies the file's other values.
- The Routes registry is a required deployment artifact and the server treats it as one (ADR 0014). A registry that is missing, empty, unreadable, or unparseable now fails startup with a message naming which of the four it was, instead of booting an application whose access model, SEO policy, and `private, no-store` guarantee were all switched off by the same missing file. A registry that declares no routes is a startup failure, never a degraded mode.
- Registry resolution no longer reads the process working directory — in ASP.NET it is also the default content root, so a deployment's access model no longer depends on the directory its host happened to start it in. It resolves from an explicit value (`AddPoyo`'s argument or `Routes:JsonPath`, a relative value against the content root), then `routes.json` beside the application assembly, then a hard failure. The server csproj copies the project-root registry beside the assembly, so a published output is self-contained, and the framework package's own default resolution moved to the same anchor.
- Poyo-owned page responses now emit `Cache-Control: private, no-store`: HTML documents, navigation descriptors, access challenges, guest redirects and page errors. `Vary: X-Poyo-Navigation` is retained as the representation selector. Because the directive applies to every document, main documents are no longer eligible for the browser's back/forward cache, so cross-document Back/Forward refetches instead of restoring instantly (ADR 0013).
- The template's cookie-mutating login, refresh and logout responses apply the same policy through the project-owned `[PrivateNoStoreResponse]` filter. Unrelated API responses are unaffected.
- The conventional `controller/action` URL of a page route is no longer served, which closes a privacy hole. The access filter resolved a route by path *or* by controller and action, so a conventional URL could be served a page by an action no registry route authorized. The filter's route was the only one that resolved: the page result saw none, so such a URL answered no navigation descriptor, set no `Vary: X-Poyo-Navigation`, and rendered through an action the registry never authorized — probed against the template registry, an anonymous `/Page/Index` returned 500 because the view path and the route were both null, and a URL whose controller and action no registry route named got no access model and no `private, no-store` at all. The conventional fallback route is removed from the template's pipeline, so no URL outside the registry can reach a page action and every URL that reaches a page carries the same access, SEO, descriptor and privacy policy (ADR 0016).

### Changed

- One lookup resolves every request. `RoutePolicy.Find`, by normalized request path, is the only way a server seam answers "which route serves this request": the access filter, the SEO filter, the page controller, and the controller extension. The controller/action lookup and its access-priority ordering are removed, along with the list-order tie-break between routes that share a defaulted controller. `RoutePolicy.FindForRequest` is removed from the framework package's public server core; call `Find` with a request path instead.
- A route's identity is one thing, defined once, and the declared registry is held to it at boot (ADR 0015): a path must begin with a slash and carry no trailing slash except for the root, a name must be present and carry no leading or trailing slash, both must be unique across the registry ignoring case, and a controller and an action are declared together or not at all, neither blank. Every one of these is a startup failure naming the offending route and the value — none is a warning, because in a container or under a service manager a warning is invisible until a visitor reaches the broken state. Duplicate-path detection now compares normalized paths, so two declarations differing only by a trailing slash collide instead of being served in declaration order, and two routes claiming one name are refused rather than resolving to different pages depending on the case of the string used to ask for it. The registry is read by three runtimes, each of which would otherwise need its own normalizer; canonical-on-disk replaces all three with none.
- Requests stay liberal against that strict file: an incoming path is normalized (trailing slashes trimmed, the root preserved) and matched case-insensitively, so `/settings`, `/Settings` and `/Settings/` all serve the declared `/Settings` with the same status, page name and privacy headers. A request URL is owned by the browser; a declaration is not.
- **Operator migration — a value you added to your own production `.env` reverts when the file stops being read, and a green boot is not evidence the migration is complete.** Those values are authoritative today precisely because the loader overrode the process, so the moment the file is no longer read outside development they revert — and they revert at exactly the moment you set your environment variable correctly and believe the deployment is tightened. Inventory the production `.env` and diff it against `.env.example`: every key that is not in the example belongs on the host. Do it in the same change that sets `ASPNETCORE_ENVIRONMENT=Production`.
- The supported host mechanisms, by name: a service manager `EnvironmentFile=`, `docker run --env-file`, IIS `web.config` `environmentVariables`, or an `appsettings.Production.json`. `Routes:JsonPath` is the value most likely to be present in a hand-edited production `.env` and the one whose loss is a security regression. The loss is **silent**, not loud: the published artifact carries its own copy of the registry beside the application, so a deployment that loses the name still boots, still enforces an access model, and still answers every request — the model of a different file, with nothing in the logs to say so.
- The environment file now fills gaps without ever overriding a value the process already has set. The loader's default is to override, so the behaviour is stated at the call site rather than inherited. A value set in a developer's shell now wins over the same value in `.env`, and `ASPNETCORE_ENVIRONMENT` in `.env` is ignored — the hosting environment comes from the process, which for `dotnet run` means `Poyo.Server/Properties/launchSettings.json`. `.env.example` says so instead of carrying a value that looks authoritative and is not.
- The Vite variable requirements and the port-integrality gate are development requirements and now run only in development, so a production host needs no Vite variables. The `AllowedHosts` and `ASPNETCORE_ENVIRONMENT` requirements are gone: the allowed-hosts value ships in `appsettings.json`, which the publish output includes, and an unset hosting environment is production rather than a failure. A missing development variable still fails loudly and names the variable.
- The server bootstrap no longer derives a directory from the working directory, which removes the null-forgiving dereference that threw when the working directory was the filesystem root. Development launches get their values — the project-root registry and the optional `.env` — from `Poyo.Server/Properties/launchSettings.json`, so a run-from-source launch works with no environment file present.

### Fixed

- A registry the process cannot reach is reported as unreachable rather than missing. `File.Exists` answers false for any stat failure, not only for an absent file, so a registry inside a directory the process cannot enter was reported "was not found" — the one diagnosis that sends an operator looking for a file that is already there. It now says the path cannot be reached, which keeps the registry's failure states distinguishable rather than collapsing two of them into one.
- A registry that is neither well-formed JSON nor a valid schema now reports `is not a valid routes registry` rather than claiming the text is not JSON. `RouteDefinition` is a positional record, so a schema violation surfaces as the same exception, and "not valid JSON" was untrue for it.
- The claim that registry resolution "never consults the process working directory" was true only of the default branch, and is now stated per branch. A relative `Routes:JsonPath` resolves against the content root, which in ASP.NET *is* the working directory, so a relative override inherits it — by the operator's own instruction, rather than by the framework's choice.
- The `poyo` route manager refuses the same registries the server refuses. An absent `access` is its documented `protected` default rather than a refusal, and a `"controller": null` reads as undeclared rather than as a declaration that is blank, so the CLI and the boot accept the same registries.
- A descriptor request that the server answers with a redirect no longer commits the redirect target's page. The client requested the descriptor without following redirects, so a `protected` route's authentication challenge (or a `guest` route's landing redirect) degrades to a document load of the URL that was actually asked for. Previously the client followed the redirect, committed the other page's route, Page data and SEO, and wrote the requested URL to history, leaving the address bar and the screen describing different pages.
- Dynamic descriptor requests state `credentials: "same-origin"` explicitly. This matches the `fetch` default and changes no network behavior.
- A Back/Forward traversal that cannot fetch a descriptor now hands the URL back with `location.replace` instead of `location.assign`, so the document load settles the entry the browser already moved to rather than risking a history entry that was never rendered. Push-versus-replace for a client-initiated navigation is unchanged.

### Documentation

- The operator upgrade procedure is written out rather than summarized: the template's `README.md` gains an "Upgrading an existing deployment" section — the diff against `.env.example` an operator runs before upgrading, the values to expect in it, `Routes:JsonPath` called out as the one to check twice, the four supported host mechanisms by name, and why a green boot is not evidence the migration is complete. The root `README.md` and `AGENTS.md` §8.2 carry the hazard and point at it.
- The four changelogs are reconciled with what shipped, each at its own altitude. The root changelog and `poyo-template`'s gain the registry diagnostics an operator reads at a boot failure — a registry the process cannot reach distinguished from a missing one, and the per-branch working-directory correction. `poyo`'s gains the unreachable-registry fix, which is a change to its public server core. `create-poyo-app`, which carried a single entry, records the three contracts a newly scaffolded project now inherits: the registry as a required artifact, a route's identity as canonical on disk, and the process environment owning the hosting environment.
- The registry's deployment guidance now calls it a security control as well as a required artifact, and states each registry failure state as the message an operator reads it by — not there and cannot reach are separate diagnoses, an empty file and a registry that declares no routes are separate, and a schema violation reports the offending member. The unqualified "the working directory is never consulted" is corrected per branch wherever it appeared, including the server core's own doc comment.
- Two claims that had no test behind them are now pinned at the published-application seam: a deployment that loses `Routes:JsonPath` serves a *different* access model than the one its host named, and the publish output carries no environment file.



## [0.5.0-beta.2] - 2026-09-24

### Changed

- Page data has one authoring seam: controller actions return `this.PoyoPage(data)`, while default registry routes have no Page data. The seam accepts a JSON object or `null`; for the same controller-produced value, document `window.SERVER_DATA` and navigation descriptor `pageData` are structurally equal.
- The framework-owned `@Html.PoyoPageData()` helper safely embeds document Page data with `JavaScriptEncoder.Default`, emits no script when data is absent, and prevents HTML-sensitive characters from terminating the script element.
- Navigation descriptor requests no longer execute Razor views to scrape Page data, and a missing Razor view now returns 404 before a descriptor is advertised.
- Conventional controller aliases now resolve the matched registry route for access and SEO enforcement.
- `PageResult.For` retains its public pre-serialized string API while centralizing object validation and `JsonElement` cloning at the factory boundary.
- Document Page data is emitted as an encoded JSON string parsed with `JSON.parse`, preserving special property names such as `__proto__`.

### Removed

- View-authored `ViewBag.ServerData` and the raw `@Html.Raw` layout script are no longer a supported Page data channel. To upgrade, map each data-bearing route to a controller action, move its data into a JSON object, return `this.PoyoPage(data)`, add `@using Poyo.Framework` to `Views/_ViewImports.cshtml`, and replace the layout's raw script with `@Html.PoyoPageData()`. Wrap arrays or primitives in a top-level property such as `{ items = values }`.


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

- The published `create-poyo-app` resolves `@rubichandrap/poyo-template` as the release version instead of the raw `workspace:*` protocol — 0.3.0 shipped the leak (npm publish does not rewrite workspace deps; pnpm publish does) and standalone installs (`npx`/`pnpm dlx`) failed with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`. Publishing is back on `pnpm publish`, and the release fixture now gates the published scaffolder installs standalone.

## [0.3.0] - 2026-08-16

### Added

- Client runtime subpath: `usePage` ships from `@rubichandrap/poyo` as `./runtime` (ADR 0005); generated projects import the accessor from the framework package, and the template's local copy is deleted
- Route resolution ships in the client runtime (ADR 0006): `createRouteTable` from `@rubichandrap/poyo/runtime`; the template's `route-loader.ts` slims to a Vite-boundary adapter, `poyo generate` emits the gitignored typed route manifest (`RouteName`/`RoutePath` unions + `routePath()`), every route command re-emits it, and the server injects the base path (`data-base-path`) so subpath deployments bind correctly
- Release-time fixture e2e (`pnpm run test:release`): scaffolds a real project, installs `@rubichandrap/poyo` from npm at the release version, and asserts the resolved package and the `usePage` accessor in the built client bundle — red until the version is published (the npm-resolution proof)

### Changed

- The scaffolder pins the generated client's `@rubichandrap/poyo` devDependency to the release version at generate time (silent-skip when the template doesn't declare it)

## [0.2.0] - 2026-08-04

### Changed

- Route access model cut: the registry's `isPublic`/`isGuestOnly` flags are replaced by a single `access` field (`public` | `guest` | `protected`, default `protected`) written by the CLI, rejected as unknown when hand-edited, and enforced universally on the server via `RouteAccessFilter` (no per-action attributes). `SeoPolicyFilter` applies registry SEO to every route with the route name as the default title.
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

# Changelog

All notable changes to the Poyo monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Changed

- A route path may no longer declare an empty or dot (`.`/`..`) segment, the percent-encoded `%2e` spellings included, since the URL parser reads those as dots, nor hold a backslash, which a browser reads as `/` (ADR 0015). A dot segment is normalized away before the page is requested, so the route was unreachable at the URL the registry states; an empty segment is not expressible as an ASP.NET route pattern, so the boot failed inside routing with an error naming neither the route nor its file; and a backslash path was never the URL requested, so its route was unreachable too. `poyo route add ../../X` also wrote the page and view outside `src/pages/` and `Views/`. The server refuses such a registry at boot, the route manager refuses it on every read and write, and `poyo route add` refuses the argument before deriving any file path. **Upgrading:** a registry declaring one now fails to start until its path is corrected.
- The scaffolder protects framework identifiers by rule, not by a hand-kept list: a `Poyo` immediately followed by an uppercase letter (`PoyoPage`, `PoyoPageData`, a future `PoyoHost`) survives the rename verbatim, so adding an entry point to the framework no longer needs a scaffolder change. `Poyo.Framework`, `AddPoyo` and `X-Poyo-Navigation` stay protected explicitly, because the shape rule cannot see them; every other `Poyo` — `Poyo.Server`, `Poyo.Server.Tests`, the solution, documentation text, `VITE_APP_NAME` — is still renamed to the project's. A generated project comes out exactly as before except for one build-guard target name that is now kept.
- The framework owns the host bootstrap (ADR 0021). `PoyoHost.CreateBuilder(args)` in the server core reads the hosting environment from the process before anything loads, loads the environment file for development or an unset environment only, and chooses the content root; the template's `Program.cs` calls it instead of `WebApplication.CreateBuilder`. Fixes to any of it now arrive with `pnpm update @rubichandrap/poyo`. The server project must reference DotNetEnv, and the build guard names the package when it does not. **Existing projects keep compiling and behaving as they do;** the `poyo-template` changelog names the `Program.cs` blocks the call replaces.

## [0.6.0] - 2026-11-17

### Added

- Views can add SSR-only head elements (canonical, hreflang, preload) with `@section Head`; `_Layout.cshtml` renders it at the end of `<head>`. Mark them `data-poyo-seo` so a dynamic navigation away removes them; a navigation descriptor never runs the view (ADR 0020). Existing projects: add `@await RenderSectionAsync("Head", required: false)` before `</head>` in their layout.
- CI: `.github/workflows/ci.yml` runs every workspace gate on each pull request and push to `main` — lint and format, client checks, `release:check`, the framework and scaffolder suites, the navigation model check at depth 7, the server tests (which must leave the tracked tree unchanged), and the platform-facts, clean-checkout and packed-tarball checks in Chromium. Before it, only CodeQL ran on pull requests, and the release workflow ran no unit suite; it now runs them before publishing.

### Changed

- **Boot-time check:** `Routes:LandingPath` is validated against the registry when the registry has a guest route (ADR 0004 amendment). A guest route as the landing path redirected a signed-in visitor to itself forever, and a path no route declares — including the `/Dashboard` default in a project that removed its Dashboard — landed on a 404; both now fail the boot with a message naming the setting and the reason. **Upgrading:** a project with guest routes and no `/Dashboard` route must set `Routes:LandingPath` to a non-guest route (or an absolute URL), or it will not start.
- `PageResult.For` is internal. Controllers author pages through `this.PoyoPage(data)`; the server core compiles into the application's assembly, so existing calls still compile, but the factory is no longer a supported API.

### Fixed

- A published application serves its assets whatever directory the host starts it from. ASP.NET's content root defaults to the working directory, so a host that started the application elsewhere served pages with their bundle, styles and icon answering 404 and read no `appsettings.json`; started from `/` (a service manager's default) it also watched the whole filesystem for configuration changes before listening, and on a CI runner did not answer within a minute. The working directory stays the content root when it holds the application's `appsettings.json` (the publish directory, or the project directory under `dotnet run`); otherwise the application directory is, unless the host names one (ADR 0014 amendment). **Existing projects:** apply the `Program.cs` change (`WebApplicationOptions.ContentRootPath`) from the template.
- Back/Forward returns to the position an entry was left at even when it was left within a frame of the last scroll. Scroll was recorded into history state on an animation frame, which cannot be written once the address bar has moved past the entry; positions are now also remembered per entry key (`__poyo.key`) in memory, on every scroll event and from the viewport at `popstate` (ADR 0019 decision 7). The model check's exemption for this case, documented as a known limit in 0.5.1, is removed.
- `router.push("#x")` and `router.replace("#x")` (or `/same-page#x`) are the browser's own fragment navigation, as an in-page anchor is, instead of a descriptor request, a second commit of the page on screen, a history entry and a scroll to the top (ADR 0019 decision 8).
- A Back/Forward to a fragment entry (`/page#section`) whose descriptor cannot be answered now reloads the entry. Its fallback called `location.replace` with the URL already in the address bar, which the browser treats as a fragment navigation — no request — so the previous page stayed on screen under the new URL. Found by the navigation model check once its simulated browser modelled fragment navigation; `scripts/platform-facts.test.mjs` pins both browser behaviors in Chromium.
- `poyo route update` re-emits `routes.generated.ts` even when the update changes nothing, as every other route command does.
- The OpenAPI snapshot export no longer rewrites `poyo.client/openapi/openapi.json` when the API has not changed. The committed file is formatted by the repository's formatter, so every Development boot left a whitespace-only diff; a semantically equal document is now left alone. The server test suite also exports to a temporary path instead of the source tree.

## [0.5.1] - 2026-11-17

### Fixed

- The scaffolder no longer accepts a project name the generated server cannot compile under. The name becomes the root namespace, and C# resolves a simple name to a namespace before an imported type, so `Task`, `Environment`, `Path` and `Exception` passed the 0.5.0 grammar and produced a project that failed `dotnet build` (`CS0118: 'Task' is a namespace but is used like a type`). Such a name is now refused before any file is written, with a message naming the clash. The list is derived from the C# a generated project compiles (`scripts/reserved-names.mjs`, a small C# lexer that keeps interpolation holes and drops string text) and a test fails while the committed list is stale; it over-collects rather than under-collects, so a few ordinary words that appear in the shipped C# (`Dashboard`, `Login`) are refused too.
- Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, `LPT0`–`LPT9`, any case) are refused as project names: they scaffolded on Linux and macOS but cannot be a directory on Windows.
- A Back/Forward scroll restore no longer lands on a newer page. The restore runs on the next animation frame and was not tied to its navigation, so a `push` whose descriptor answered within one frame of a traversal's commit showed the new page at the previous entry's offset, and the scroll listener then recorded that offset as the new entry's. The frame now does nothing once a newer navigation has started (ADR 0019 decision 6). Found by a TLA+ check of the router with a frame queue; the navigation model check now models animation frames as their own event, with an invariant that a frame never moves a page committed after it was queued.
- **Behavior change:** under a path base, an app path is prefixed exactly once. `withBasePath` left any href that already started with the base alone, so that `Link` and the router could both apply it; that made an app path whose first segment spells the mount indistinguishable from a resolved URL. Under base `/app`, a `Link` to the route `/App/settings` requested `/App/settings`, which the server's `UsePathBase` strips to `/settings` — another page. `Link` now hands the router the app-relative href, the router resolves it once, and `withBasePath("/App/settings", "/app")` is `/app/App/settings`. Code that passed an already-resolved browser URL (for example `location.pathname`) to `router.push` or `withBasePath` must pass the app path instead, as the contract already said. `test/subpath-contract.test.ts` now checks the round trip — the server routes back the app path it was given — over every mount and every one- and two-segment app path drawn from colliding words.

### Changed

- ADR 0011 is amended: TypeScript returned to `5.9.3` in 0.5.0-beta.4 and the peer suppression was removed, which reversed its decisions 1, 3 and 4 without saying so. Decision 2 (no `baseUrl`) stands.
- The 0.5.0 and 0.5.0-beta.4 changelog sections were empty and their entries filed under 0.5.0-beta.3. The clean-checkout, project-name, TypeScript-pin and license entries now sit under beta.4 and the subpath-deployment entries under 0.5.0.

## [0.5.0] - 2026-11-17

### Added

- Subpath deployment is supported end to end, and proven as a state model. `poyo build` now emits asset tags as `@Url.Content("~/generated/…")` and records the manifest app-relative, so a host mounted under `/Poyo` serves its own bundle instead of asking the host root; the template applies `PathBase` once through `UsePathBase`, and the client derives its API base from the same `data-base-path` the navigation uses (`src/lib/base-path.ts`). `packages/poyo/test/subpath-contract.test.ts` models URL resolution as a containment invariant over every mount point, emitted form and document URL — root-absolute forms escape a subpath, document-relative forms break on nested routes, app-relative forms hold — and the pre-publish browser check now runs Link/Back/Forward twice, at the root and under `/Poyo`.

## [0.5.0-beta.4] - 2026-11-17

### Added

- A clean clone can run the documented template commands. `packages/poyo` exposes its binary through a gitignored `dist`, so `pnpm install` used to leave nothing runnable and `pnpm run generate` failed on the first documented command. A root `postinstall` (`build:packages`) now builds both workspace CLIs, and `scripts/clean-checkout.test.mjs` walks the lifecycle as a state machine against a real `git clone` — tracked files only, install, run the binary, generate — so the invariant is checked rather than assumed.
- The scaffolder accepts a project name only when it can be a C# namespace segment, an npm package name and one directory name at once (`^[A-Za-z][A-Za-z0-9_]{0,63}$`). The grammar is one finite automaton, validated before anything is written, and its model check compares it against an independent three-consumer oracle on every string up to length 4. Names such as `my-app`, `1App`, `app.name` and `..` are refused with the rule they broke.
- Every TypeScript pin is `5.9.3`, inside `openapi-typescript`'s declared `typescript` peer range; the `pnpm.peerDependencyRules.allowedVersions` suppression that hid the conflict is gone, and `pnpm run release:check` runs a peer gate that reads the versions pnpm actually resolved. The range model lives in `scripts/peer-ranges.mjs`.
- Every package manifest declares `"license": "MIT"` and carries its own `LICENSE`. npm renders the license from the manifest field, not from the file in the tarball, so the published packages previously showed no license.

## [0.5.0-beta.3] - 2026-11-17

### Security

- The process environment now owns the hosting environment, and an environment file is a development convenience (ADR 0017). A deployment that sets its hosting environment correctly is no longer overridden by a `.env` file: the environment is read from the process (`DOTNET_ENVIRONMENT`, else `ASPNETCORE_ENVIRONMENT`, the order the framework itself uses) before anything else loads, so the file cannot decide the environment it is conditional on, and it is read only when the process says development or says nothing. The file never contributes the hosting environment under either name, and after it is read the process's own values are put back. A `.env` present in a production deployment cannot contribute the environment under either name, so developer exception pages, the Vite development integration, and the absence of HTTPS redirection cannot be enabled by accident — and it is not read at all once the host names the environment. An unset environment is production and does still read the file, so a deployment that forgets to set it applies the file's other values.
- The Routes registry is a required deployment artifact and the server treats it as one (ADR 0014). A registry that is missing, empty, unreadable, or unparseable now fails startup with a message naming which of the four it was, instead of booting an application whose access model, SEO policy, and `private, no-store` guarantee were all switched off by the same missing file. A registry that declares no routes is a startup failure, never a degraded mode.
- Registry resolution no longer reads the process working directory — in ASP.NET it is also the default content root, so a deployment's access model no longer depends on the directory its host happened to start it in. It resolves from an explicit value (`AddPoyo`'s argument or `Routes:JsonPath`, a relative value against the content root), then `routes.json` beside the application assembly, then a hard failure. The server csproj copies the project-root registry beside the assembly, so a published output is self-contained, and the framework package's own default resolution moved to the same anchor.
- Poyo-owned page responses now emit `Cache-Control: private, no-store`: HTML documents, navigation descriptors, access challenges, guest redirects and page errors. `Vary: X-Poyo-Navigation` is retained as the representation selector. Because the directive applies to every document, main documents are no longer eligible for the browser's back/forward cache, so cross-document Back/Forward refetches instead of restoring instantly (ADR 0013).
- The template's cookie-mutating login, refresh and logout responses apply the same policy through the project-owned `[PrivateNoStoreResponse]` filter. Unrelated API responses are unaffected.
- The conventional `controller/action` URL of a page route is no longer served, which closes a privacy hole. The access filter resolved a route by path *or* by controller and action, so a conventional URL could be served a page by an action no registry route authorized. The filter's route was the only one that resolved: the page result saw none, so such a URL answered no navigation descriptor, set no `Vary: X-Poyo-Navigation`, and rendered through an action the registry never authorized — probed against the template registry, an anonymous `/Page/Index` returned 500 because the view path and the route were both null, and a URL whose controller and action no registry route named got no access model and no `private, no-store` at all. The conventional fallback route is removed from the template's pipeline, so no URL outside the registry can reach a page action and every URL that reaches a page carries the same access, SEO, descriptor and privacy policy (ADR 0016).

### Changed

- **Breaking:** `usePage()` follows React's hook rules now that it subscribes to the store, so it must be called while a component renders. Read Page data elsewhere with `getPageData()`.
- The template resolves app URLs through the runtime: `Link` takes `routePath()` results directly, full-page redirects use `withBasePath()`, and the build-time `appUrl()` helper (`src/lib/base-url.ts`) is gone. The Dashboard logout no longer redirects to the host root under a base path.
- **The registry's rules are now proven equivalent across the server and the route manager, not asserted (ADR 0018).** They are written twice, in C# and in TypeScript, because the two runtimes refuse a bad registry at different moments, and two suites that each assert their own wording cannot detect the wording drifting apart — which is how an absent `access` and a `"controller": null` came to disagree in the first place. A **registry corpus** at `fixtures/registry/` holds one file per rule, a registry and the verdict it earns, and both runtimes read all of it: a rule added to one side and not the other is a test failure rather than a review finding. A case declaring one verdict for the two also pins the message fragments both messages must carry; a case declaring a verdict per runtime pins a deliberate difference — today the empty registry, which the route manager legitimately reads and the server refuses to boot on because a registry declaring no routes switches off the access model, the SEO policy and the `private, no-store` guarantee. The corpus lives at the repository root because it belongs to neither package: `packages/poyo` must not read files out of `poyo-template`, and the template's tests must not read them out of a published package. A validation rule lands with its case; that is the workflow the mechanism depends on.

- One lookup resolves every request. `RoutePolicy.Find`, by normalized request path, is the only way a server seam answers "which route serves this request": the access filter, the SEO filter, the page controller, and the controller extension. The controller/action lookup and its access-priority ordering are removed, along with the list-order tie-break between routes that share a defaulted controller. `RoutePolicy.FindForRequest` is removed from the framework package's public server core; call `Find` with a request path instead.
- A route's identity is one thing, defined once, and the declared registry is held to it at boot (ADR 0015): a path must begin with a slash and carry no trailing slash except for the root, a name must be present and carry no leading or trailing slash, both must be unique across the registry ignoring case, and a controller and an action are declared together or not at all, neither blank. Every one of these is a startup failure naming the offending route and the value — none is a warning, because in a container or under a service manager a warning is invisible until a visitor reaches the broken state. Duplicate-path detection now compares normalized paths, so two declarations differing only by a trailing slash collide instead of being served in declaration order, and two routes claiming one name are refused rather than resolving to different pages depending on the case of the string used to ask for it. The registry is read by three runtimes, each of which would otherwise need its own normalizer; canonical-on-disk replaces all three with none.
- Requests stay liberal against that strict file: an incoming path is normalized (trailing slashes trimmed, the root preserved) and matched case-insensitively, so `/settings`, `/Settings` and `/Settings/` all serve the declared `/Settings` with the same status, page name and privacy headers. A request URL is owned by the browser; a declaration is not.
- **Operator migration — a value you added to your own production `.env` reverts when the file stops being read, and a green boot is not evidence the migration is complete.** Those values are authoritative today precisely because the loader overrode the process, so the moment the file is no longer read outside development they revert — and they revert at exactly the moment you set your environment variable correctly and believe the deployment is tightened. Inventory the production `.env` and diff it against `.env.example`: every key that is not in the example belongs on the host. Do it in the same change that sets `ASPNETCORE_ENVIRONMENT=Production`.
- The supported host mechanisms, by name: a service manager `EnvironmentFile=`, `docker run --env-file`, IIS `web.config` `environmentVariables`, or an `appsettings.Production.json`. `Routes:JsonPath` is the value most likely to be present in a hand-edited production `.env` and the one whose loss is a security regression. The loss is **silent**, not loud: the published artifact carries its own copy of the registry beside the application, so a deployment that loses the name still boots, still enforces an access model, and still answers every request — the model of a different file, with nothing in the logs to say so.
- The environment file now fills gaps without ever overriding a value the process already has set. The loader's default is to override, so the behaviour is stated at the call site rather than inherited. A value set in a developer's shell now wins over the same value in `.env`, and `ASPNETCORE_ENVIRONMENT` in `.env` is ignored — the hosting environment comes from the process, which for `dotnet run` means `Poyo.Server/Properties/launchSettings.json`. `.env.example` says so instead of carrying a value that looks authoritative and is not.
- The Vite variable requirements and the port-integrality gate are development requirements and now run only in development, so a production host needs no Vite variables. The `AllowedHosts` and `ASPNETCORE_ENVIRONMENT` requirements are gone: the allowed-hosts value ships in `appsettings.json`, which the publish output includes, and an unset hosting environment is production rather than a failure. A missing development variable still fails loudly and names the variable.
- The server bootstrap no longer derives a directory from the working directory, which removes the null-forgiving dereference that threw when the working directory was the filesystem root. Development launches get their values — the project-root registry and the optional `.env` — from `Poyo.Server/Properties/launchSettings.json`, so a run-from-source launch works with no environment file present.
- The operator upgrade procedure is written out rather than summarized: the template's `README.md` gains an "Upgrading an existing deployment" section — the diff against `.env.example` an operator runs before upgrading, the values to expect in it, `Routes:JsonPath` called out as the one to check twice, the four supported host mechanisms by name, and why a green boot is not evidence the migration is complete. The root `README.md` and `AGENTS.md` §8.2 carry the hazard and point at it.
- The four changelogs are reconciled with what shipped, each at its own altitude. The root changelog and `poyo-template`'s gain the registry diagnostics an operator reads at a boot failure — a registry the process cannot reach distinguished from a missing one, and the per-branch working-directory correction. `poyo`'s gains the unreachable-registry fix, which is a change to its public server core. `create-poyo-app`, which carried a single entry, records the three contracts a newly scaffolded project now inherits: the registry as a required artifact, a route's identity as canonical on disk, and the process environment owning the hosting environment.
- The registry's deployment guidance now calls it a security control as well as a required artifact, and states each registry failure state as the message an operator reads it by — not there and cannot reach are separate diagnoses, an empty file and a registry that declares no routes are separate, and a schema violation reports the offending member. The unqualified "the working directory is never consulted" is corrected per branch wherever it appeared, including the server core's own doc comment.
- The property-name case question is decided and recorded (ADR 0018), along with where a corpus shared by `packages/poyo` and `packages/poyo-template` lives and why a generated rule table was rejected. Sixteen per-rule fixtures and the tests that read them are gone from the template's test project: a rule with a fixture in one suite and a case in the other has two sets of wording, which is the hazard the corpus removes. `StartupFailureTests` now boots every registry the corpus says the server refuses.

### Fixed

- A registry JSON-LD value containing `</script>` no longer closes the layout's script element: `SeoPolicyFilter` re-serializes JSON-LD with HTML-sensitive characters escaped.
- The fixture e2e requested `/api/test-unrelated` for a controller routed at `/api/TestUnrelated`, so the release gate could never pass that step.
- Back/Forward to the landing page, to an in-page fragment entry, or to an entry another library pushed no longer reloads the whole document. `popstate` fires only for entries of the current document, so the old "no Poyo state → document load" branch was only ever reached by this document's own entries. The router now stamps the landing entry on install, adopts any unrecorded entry it scrolls on, and traverses every non-hash entry through the descriptor (found by the navigation model check, `test/navigation-model.test.ts`).
- Back past a same-URL entry another library pushed (an open modal, a tab) no longer reloads the page; that entry is left to its library.
- `push` no longer copies the outgoing entry's history-state keys into the new entry; `replace` still preserves them.
- `replace()` now shows the new page from the top, as `push()` does. It already wrote a top-of-page scroll record for the entry while leaving the screen at the old offset, so returning to that entry later jumped to the top.
- After a dynamic navigation the `<head>` matches the server-rendered document for the new route: the title goes through the layout's format (`data-poyo-title-template`, so `Dashboard - Poyo` stays `Dashboard - Poyo`), and the previous route's description, meta/OG tags and JSON-LD (marked `data-poyo-seo` by the layout) are replaced instead of staying behind. Existing projects: add both attributes to `_Layout.cshtml` as the template now does.
- `Link`, `router.push` and `router.replace` resolve app-relative hrefs against the base path, so `routePath()` results work when the app is hosted under one (e.g. `/Poyo`). Previously such a link left the app with a document load to the host's root. **Behavior change:** a root-relative `Link` href outside the base is now prefixed too; leave the app with an absolute URL or a plain `<a>`.
- Under base `/app`, the route table no longer strips `/apple` to `/le`; the base path matches on a segment boundary.
- A dynamic navigation to another page with a fragment (`/About#team`) scrolls to that element once it renders, instead of staying at the top.
- `usePage()` subscribes to the navigation store, so a page below a memoized boundary re-renders with the new Page data.
- The guest redirect resolves `Routes:LandingPath` under the request's path base: an app hosted at `/Poyo` lands on `/Poyo/Dashboard`.
- A descriptor answers with the page result's status code, like the document. A `PoyoPage` result given `StatusCode = 410` was a 200 descriptor; now the client falls back to a document load, which renders the page with its status.
- Scrolling while a Back/Forward descriptor is in flight no longer writes the outgoing page's position into the destination entry's scroll record, and traversing to an entry without a record shows its page from the top instead of at the outgoing page's offset.
- After a dynamic navigation, a route whose registry `seo` has no `title` shows the route name (as the server-rendered document does) instead of keeping the previous page's title, and a route without a description removes the description tag instead of keeping the previous page's text or an empty tag.
- A client-initiated `router.replace()` that cannot fetch a descriptor now degrades to a document load through `location.replace` instead of `location.assign`, so a failed replacement no longer adds a history entry; `push()` still degrades through `location.assign`. Both fallback sites in the runtime's `navigate` — the unanswered-descriptor path and the thrown-request path — preserve the operation the caller asked for, matching what traversal already did. Recorded in ADR 0009 and `AGENTS.md` §3.7.
- A registry the process cannot reach is reported as unreachable rather than missing. `File.Exists` answers false for any stat failure, not only for an absent file, so a registry inside a directory the process cannot enter was reported "was not found" — the one diagnosis that sends an operator looking for a file that is already there. It now says the path cannot be reached, which keeps the registry's failure states distinguishable rather than collapsing two of them into one.
- A registry that is neither well-formed JSON nor a valid schema now reports `is not a valid routes registry` rather than claiming the text is not JSON. `RouteDefinition` is a positional record, so a schema violation surfaces as the same exception, and "not valid JSON" was untrue for it.
- The claim that registry resolution "never consults the process working directory" was true only of the default branch, and is now stated per branch. A relative `Routes:JsonPath` resolves against the content root, which in ASP.NET *is* the working directory, so a relative override inherits it — by the operator's own instruction, rather than by the framework's choice.
- The `poyo` route manager refuses the same registries the server refuses. An absent `access` is its documented `protected` default rather than a refusal, and a `"controller": null` reads as undeclared rather than as a declaration that is blank, so the CLI and the boot accept the same registries.
- A registry field had more than one accepted spelling on the server. The deserializer matched property names case-insensitively — which is how a lower camel case registry maps onto a PascalCase model at all — so `{"Path": "/Home"}` and `{"Access": "public"}` booted where the route manager refused them, and a rule written once meant two things across the three runtimes that read the registry. The server now checks field names, the members a route must carry, and the `access`/`dynamic` values on the raw JSON before the deserializer: a mis-cased member is an unknown member, and a route with no `files` or no `files.view` is refused at boot instead of deserializing to a null that only surfaced when the routes were mapped. A registry that already booted with a mis-cased member now fails to start, with a message naming the member and the route.
- A `dynamic` field spelled with the wrong case reported *"is not a valid routes registry"* instead of the dynamic-field message. The pre-check's lookup was case-sensitive, so it missed the field entirely and the deserializer's generic parse failure answered — the one message that names neither the field nor the route. It is reported for the value now, with the spelling it was written in beside it, and the field-name check covers the rest.
- Every registry failure the server reports now names the offending route, not a position in the JSON. The deserializer's unmapped-member, enum and type messages identified a member and a JSON path; the schema check reports the same failures with the route beside them, naming a route with no readable `path` by its name instead. The route manager names the route in its unknown-field and blank-name messages for the same reason.
- The route manager reads a blank or unrooted `path` as one rule rather than two, and refuses an array where an object is required.
- The route manager no longer refuses an authored `"seo": null`, which the server serves. It is the same reading it already followed for `"controller": null` — a null is a declaration of absence, not a declaration nothing can act on — and it was the only case the shared registry corpus found where the two runtimes disagreed about one field's meaning.
- A descriptor request that the server answers with a redirect no longer commits the redirect target's page. The client requested the descriptor without following redirects, so a `protected` route's authentication challenge (or a `guest` route's landing redirect) degrades to a document load of the URL that was actually asked for. Previously the client followed the redirect, committed the other page's route, Page data and SEO, and wrote the requested URL to history, leaving the address bar and the screen describing different pages.
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

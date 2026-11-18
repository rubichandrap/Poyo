# Poyo — rules for agents and contributors

Poyo is a minimal MPA framework: a .NET server that owns routing, access and SEO, and a decoupled React client that only receives HTML plus `window.SERVER_DATA`. It provides server routing with React hydration, dynamic navigation (ADR 0009, 0019), a server core compiled from the framework package (ADR 0008), a demo auth scaffold, Page data injection, and typed API integration. It deliberately provides no database layer, production auth, business logic or UI component library — keep it that way.

Vocabulary is in `CONTEXT.md`; the reasons behind every rule below are in `docs/adr/`. Read the ADR before changing the behavior it decides, and surface a conflict with it rather than overriding it silently.

## Server (.NET)

**Controllers**
- View controllers live in `Controllers/`, inherit `Controller`, and return `this.PoyoPage(data)` for a registry page or `View()` for a plain view. They never return JSON.
- API controllers live in `Controllers/Api/`, inherit `ControllerBase`, carry `[ApiController]` + `[Route("api/[controller]")]`, and return `ActionResult<T>` in JSend format.
- Registry routes without a `controller` are served by the framework's `PageController.Index` and have no Page data. Map the route to a custom controller (`route:add ... --controller X`, or `controller` + `action` in `routes.json`) when it needs data.
- `PageResult` is the only result for registry pages: it renders the document, or the JSON descriptor when the request carries `X-Poyo-Navigation: 1`. Reach it through `PoyoPage`; never hand-roll either representation. `PageResult.For` is internal — the server core compiles into the app's assembly, so nothing stops a call, but it is not a supported API.

**Page data** (ADR 0012)
- Controllers are the sole authors. `this.PoyoPage(data)` takes a JSON object or `null`; wrap anything else in a top-level property.
- `_Layout.cshtml` embeds it with `@Html.PoyoPageData()` only. Document `window.SERVER_DATA` and descriptor `pageData` are structurally equal for one value; a later request re-runs the controller, so time-varying fields can differ.

**Access, SEO and URLs** (ADR 0004, 0013, 0016)
- `access` in the registry (`public` | `guest` | `protected`, default `protected`) is the only page access policy, enforced by `RouteAccessFilter` before the result runs: protected + anonymous → challenge (redirect for pages, 401 for `/api`); guest + authenticated → `Routes:LandingPath` (default `/Dashboard`, resolved under the path base). When the registry has a guest route, the boot fails unless the landing path is an absolute URL or a registry route that is not `guest` (a guest landing path redirects to itself; an undeclared one lands on a 404). `[Authorize]` is available for APIs.
- Registry `seo` (`title`, `description`, `meta`, `jsonld`) is applied to every registry route by `SeoPolicyFilter`; the route name is the title when none is given. Put SEO in `routes.json`, not in views.
- One URL per route: `Program.cs` maps the registry and nothing else. Keep it free of a conventional `{controller}/{action}` route; declare a second registry route when a page needs a second URL.
- Every Poyo page response carries `Cache-Control: private, no-store` and `Vary: X-Poyo-Navigation`.

**Head parity** — the layout marks every registry-owned head element `data-poyo-seo` and declares its title format once on `<title data-poyo-title-template="%s - Poyo">`; the runtime replaces exactly those after a navigation. Keep both attributes when editing the layout. `fixtures/head/head-parity.json` holds both sides to the same head: a change to either the layout or the runtime lands with a case. A view adds SSR-only head elements (canonical, hreflang) with `@section Head`; a descriptor never runs the view, so mark them `data-poyo-seo` and a navigation away removes them (ADR 0020). Anything a client navigation must also show belongs in registry `seo`.

**Descriptor wire contract** — `X-Poyo-Navigation: 1` → `{ v, name, seo, pageData }`. The header literal and the shape are a contract between released servers and clients: add optional fields freely; bump `v` (`PageDescriptor.CurrentVersion` and the runtime's `DESCRIPTOR_VERSION`) only for a change an older client would misread, and note it in the changelog.

**Server core** (ADR 0008, 0014, 0017, 0021)
- The framework's C# ships as source in `node_modules/@rubichandrap/poyo/server/` (namespace `Poyo.Framework`) and is compiled in place by the server csproj. Treat those files as read-only; fixes arrive with `pnpm update @rubichandrap/poyo`.
- `Program.cs` creates the builder with `PoyoHost.CreateBuilder(args)` and registers the core with `AddPoyo(configuration, contentRootPath: …)` before `builder.Build()`. It applies `app.UsePoyoPathBase()` before static files and routing, and calls `MapPoyoRoutes()` after `MapControllers()`. The project's own server code is controllers, services, models, views and `GlobalExceptionHandler`.
- The registry is a security control: a missing, empty, unreadable or invalid registry fails the boot. It resolves from `Routes:JsonPath`, then `routes.json` beside the assembly — never the working directory by default.
- The framework owns the host bootstrap (ADR 0021). `PoyoHost.CreateBuilder(args)` reads the hosting environment from the process (`DOTNET_ENVIRONMENT`, else `ASPNETCORE_ENVIRONMENT`) before anything loads, loads the `.env` the launch profile names only for development or an unset environment with `NoClobber` and never lets it supply the environment, and chooses the content root: the working directory when it holds the app's `appsettings.json`, else the application directory, unless the host names one. `PoyoHost.UsePoyoPathBase()` applies the configured `PathBase` once, only when it is non-blank, in the middleware position the template's own block used. The server project must reference DotNetEnv; the build guard fails with a message naming the package when the reference is missing. Production requires nothing the template owns.

**Models and services** — DTOs under `Models/<Domain>/{Requests,Responses}`, data only, records where it fits, `required` for mandatory members. One service per domain under `Services/<Domain>/`, registered Scoped.

## Client (React / TypeScript)

- Pages: `src/pages/<Name>/index.page.tsx`, one default export, plain HTML + Tailwind utilities, logic extracted to hooks.
- Page data: `usePage<T>()` from `@rubichandrap/poyo/runtime`, called while a component renders; it subscribes to the navigation store, which `window.SERVER_DATA` seeds and every navigation updates. Code outside a render reads `getPageData<T>()`.
- API calls go through TanStack Query: one hook per endpoint in `hooks-api/`, exported from `hooks-api/index.ts`. Forms use React Hook Form + Zod, schema defined before the component, types via `z.infer`.
- TypeScript is strict with no `any`. The one exception is `ComponentType<any>` in the runtime's `PageLoader`/`AppRoute`, marked with `biome-ignore`.

**Route table** (ADR 0006, 0010) — `createRouteTable` ships in the runtime; the project keeps only `src/routes/route-loader.ts` (page glob, base path from `data-base-path`, `VITE_BASE_URL` for standalone dev). `poyo generate` and every route command emit the gitignored `routes.generated.ts`, which types `RouteName`, `RoutePath` and `routePath(name)`. `routes.json` is the only edited source.

**Dynamic navigation** (ADR 0009, 0019)
- Explicit only: `Link` (`@rubichandrap/poyo/runtime/link`) and `useRouter`/`createRouter` (`…/runtime/router`). A plain `<a>` is a document load; `data-dynamic-nav="off"` opts a `Link` out.
- Hrefs are app-relative, like registry paths: the runtime adds the base path exactly once (Next.js `basePath` semantics; `withBasePath()` for full-page redirects). A browser URL is not an input — `/app/x` under base `/app` resolves to `/app/app/x`. Leave the app with an absolute URL or a plain `<a>`.
- One path: descriptor fetch → shape and version check → route lookup → store commit → history write → head, focus, announcement. Any failure falls back to a document load through the requested operation (`push` → `location.assign`, `replace` → `location.replace`); when the target is the entry already in the address bar with a fragment (a failed traversal), `location.reload()`, because assign/replace to it is a fragment navigation that loads nothing. Rapid navigations are last-write-wins.
- A target that is a fragment of the page on screen (`push("#x")`, `push("/same#x")`) is the browser's own fragment navigation, as an in-page anchor is: no descriptor, no commit.
- Every same-document history entry is traversable through the descriptor; hash-only changes and same-URL entries the router did not write are left to the browser. Scroll is recorded per entry (keyed `__poyo.key`) only while the screen shows that entry — in memory on every scroll event and from the viewport at popstate, in history state on a frame for reloads — and restored on return.
- `packages/poyo/test/navigation-model.test.ts` model-checks this state machine and `scripts/browser-navigation.mjs` checks it in Chromium. A navigation change keeps both green; a new behavior gets an invariant or an event in the model.

## Routes registry

```json
{ "path": "/Dashboard", "name": "Dashboard",
  "files": { "react": "src/pages/Dashboard/index.page.tsx", "view": "Views/Dashboard/Index.cshtml" },
  "access": "protected", "dynamic": true, "seo": { "title": "Dashboard" } }
```

- Identity is strict on disk, liberal at runtime (ADR 0015): a path starts with `/`, has no trailing slash except `/`, has no empty or dot (`.`/`..`) segment — `%2e` counts as a dot — nor a backslash, and is unique ignoring case; a name is present, slash-free at both ends and unique ignoring case; `controller` and `action` come together and non-blank. Requests match case-insensitively with trailing slashes trimmed.
- Each field has one spelling (ADR 0018). The rules exist in C# and TypeScript, held together by `fixtures/registry/`: **a validation rule lands with its corpus case.**
- `"dynamic": false` makes a route document-only. It has no CLI flag; edit the registry by hand.
- Manage routes from `packages/poyo-template/`: `pnpm run route:add <Name>` (`--guest`, `--controller X`), `route:remove`, `route:sync`.

## Decisions and evidence

A decision that rests on platform behavior (the browser, ASP.NET, npm) names the test that exercises that behavior — in the real platform, or in a model checked against it. A mock that encodes the decision's own assumption is not evidence (ADR 0019).

## Build, generate, deploy

- CI (`.github/workflows/ci.yml`) runs every gate below on each pull request and push to `main`: lint and format, client checks, `release:check`, the framework and scaffolder suites (on Linux with the newest Node, and again on Windows and on the lowest Node `engines` allows), the model check at depth 7, the server tests (which must leave the tracked tree unchanged), and the platform-facts, clean-checkout and packed-tarball checks in Chromium. A red job blocks the merge.

- `pnpm install` builds both workspace CLIs from `postinstall` (`build:packages`), because `packages/poyo`'s binary lives in a gitignored `dist` — without it a clean clone can install and then run none of the documented template commands. `pnpm run test:clean-checkout` walks that lifecycle against a real clone.
- `pnpm --filter poyo-template run client:generate` — DTOs and Zod schemas from the committed `openapi/openapi.json` (re-exported by the server on Development/Staging boots), plus the route manifest.
- `pnpm --filter poyo-template run build` — client build, `poyo build` (syncs manifest assets into `wwwroot/generated` and rewrites `_ReactAssets.cshtml`), server build.
- Deployment: set `ASPNETCORE_ENVIRONMENT` on the host, and `Routes:JsonPath` only for a registry outside the app directory. `PoyoHost.CreateBuilder(args)` and `UsePoyoPathBase()` in the server core apply the hosting environment, the content root and the path base, so their fixes arrive with `pnpm update @rubichandrap/poyo` (ADR 0021). The content root is the working directory when it holds the app's `appsettings.json`, otherwise the application directory, so a published output serves its assets from any working directory (ADR 0014 amendment); `ASPNETCORE_CONTENTROOT` overrides. Set `PathBase` when the app is not at the host root: `UsePoyoPathBase()` applies it once, before static files and routing, and asset tags, `data-base-path`, navigation, API calls and the auth challenge all resolve against it. `.env` is development-only and never ships; `.env.example` carries no hosting environment. The operator procedure for upgrading a deployment that relied on a production `.env` is in `packages/poyo-template/README.md` ("Upgrading an existing deployment").

## Releasing (three packages, one version)

1. Bump `packages/{poyo-template,poyo,create-poyo-app}/package.json` to the same version; add the entry to the root and each package `CHANGELOG.md`; check with `pnpm run release:check`. A changelog entry says what changed and what a user must do (**Upgrading:**), in one or two sentences, under about 400 characters; the why lives in the ADR or the PR, so name the ADR. Step-by-step upgrade instructions are the exception and may run longer. Superseded ADR text moves to `docs/adr/archive/`, leaving a one-line pointer in the ADR.
2. Every package keeps a `README.md`. The template's README ships with every generated project, so keep it rename-safe (`Poyo`, `Poyo.Server`, `poyo.client` are rewritten).
3. Workspace gates, green before tagging:
   ```bash
   pnpm --filter @rubichandrap/poyo run test
   pnpm --filter @rubichandrap/create-poyo-app run test
   dotnet test packages/poyo-template/Poyo.Server.Tests/Poyo.Server.Tests.csproj
   pnpm run test:release:prepublish   # platform facts, clean clone, fixture from the packed tarball, browser check
   ```
   CI runs the same gates on the release PR; merge only on green.
4. Push tag `v<version>`. `release.yml` builds, type-checks, asserts versions, runs the unit suites and the pre-publish fixture, publishes with `pnpm publish` (`NPM_TOKEN`), and creates the GitHub Release.
5. After publishing, `pnpm run test:release` proves npm resolution; it is red until the version is on npm.

## Git

- Conventional Commits: `<type>(<scope>): <subject>`, imperative, ≤72 chars, no trailing period; body only for the non-obvious why, `BREAKING CHANGE:`, or `Closes #n`/`Refs #n`.
- Work on a `<type>/<short-description>` branch and merge to `main` through a pull request.
- Merging and tagging are the user's decisions. An agent opens the pull request, gets CI green and reports. It merges a pull request or pushes a release tag only when the user asks for that in its own thread, or its prompt explicitly tells it to. A prompt or parent thread that says to leave merging to someone else is binding, even when every check is green.

## Agent skills

- Issue tracker: GitHub Issues are authoritative; `.scratch/<feature>/` holds specs and plans. See `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain docs: `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

Related: for React as an ASP.NET view engine (one build, no Node in production), see [JsxCore](https://github.com/davidwhitney/JsxCore); Poyo takes the opposite stance (README, "Poyo vs JsxCore").

# Spec — Dynamic navigation and the bundled server core

ADRs: docs/adr/0008-server-core-bundled-in-framework-package.md, docs/adr/0009-dynamic-navigation.md, docs/adr/0010-encapsulated-route-manifest.md
Decided in a grilling session (2026-09-23); testing seams confirmed by the maintainer.
Labels: ready-for-agent

## Problem Statement

Every route transition in a Poyo project is a full document load. The React shell — providers, the React Query cache, any long-lived client session — is destroyed and rebuilt on every navigation, and programmatic navigation means hand-writing `window.location` jumps. Poyo's sibling framework (Pwo) solved this with hybrid navigation, but Poyo cannot copy that solution: Pwo's server half ships as a NuGet package from a private Azure Artifacts feed, and Poyo is a public framework published to npm and GitHub only — its maintainer has no NuGet account, and no second feed is acceptable. Meanwhile the server-side framework code (`RoutePolicy`, the access/SEO filters, `PageController`) is frozen in every generated project at scaffold time — ADR 0005's "copied framework code can't be upgraded" argument, left unsolved on the server. Finally, the generated route manifest leaks into app code: pages import `routePath` from `routes.generated.ts` directly, making generated-file plumbing part of every app's public import surface; and the template carries an `index.html` that is dead markup — the Razor views own every page — yet silently serves as Vite's build graph root.

## Solution

Three moves, decided with the maintainer:

1. **Dynamic navigation, explicit-only.** `useRouter()` (push, replace, back, forward, reactive route) and `<Link>` swap only the page component below the loaded shell. No global interception: no Navigation API `event.intercept`, no document-level click listener — a plain `<a>` is a document load, by design. After a client-side navigation, browser Back/Forward swap pages the same way (Next.js-parity traversal, `popstate` path only, with scroll restoration from history state). The document load remains the floor: first load of any URL, and the fallback for every failure. Descriptors are access-enforced from day one — `RouteAccessFilter` runs before the page result executes, so a protected route's descriptor challenges anonymous callers instead of leaking `pageData`.
2. **The server core ships inside the framework package.** The C# framework code moves from the template into `@rubichandrap/poyo` as readable source under a `server/` folder, and the server project **compiles it in place** through the csproj — no copy step, no NuGet, no feed. Upgrading the framework package upgrades the server core; rename-safety is by construction (the scaffolder never touches `node_modules`). The JS-side precedent is JsxCore: the one artifact the consumer already installs is the carrier for the entire core.
3. **The route manifest is encapsulated.** `routes.generated.ts` stops exporting the manifest API and becomes an ambient type augmentation imported by no one; `routePath`, `RouteName`, and `RoutePath` move into the runtime (resolved from the active route table). The manifest returns to gitignored — with app imports gone, its absence degrades gracefully to `string`-typed route names until the first generate.

The registry grows by exactly one field — `"dynamic": false` per-route opt-out — and the template loses both dead files: its frozen server framework copies and `index.html` (the build entry becomes the client module itself).

## User Stories

### Dynamic navigation — programmatic

1. As an app developer, I want `router.push(path)` to swap the page without a document reload, so that my app's client state survives navigation.
2. As an app developer, I want `router.replace(path)` to swap the page and replace the history entry, so that redirects don't stack history.
3. As an app developer, I want `router.push` to resolve my route before swapping, so that a failed navigation leaves the app on the page I was on rather than a half-swapped UI.
4. As an app developer, I want `useRouter().route` to be reactive (name, path, access), so that my shell re-renders on navigation without a provider or external state library.
5. As an app developer, I want `router.back()`/`router.forward()` to traverse history, so that programmatic flows match browser behavior.
6. As an app developer, I want a failed descriptor (non-2xx, non-descriptor body, unknown page name, apply error) to end in a document load of the same URL, so that the worst case is exactly today's behavior.
7. As an app developer, I want rapid successive pushes to be last-write-wins, so that a stale response can never swap the page twice.
8. As an app developer, I want page data to refresh per navigation through `usePage`, so that my page reads its own payload on first load and after every client-side swap.

### Dynamic navigation — declarative

9. As an app developer, I want `<Link href="/Dashboard">` to navigate without a reload, so that links behave like `push` without hand-written handlers.
10. As an app developer, I want `<Link>` to import from the runtime link subpath and `useRouter` from the router subpath, so that the declarative and programmatic surfaces mirror Next.js's `next/link` / `next/router` split.
11. As an app developer, I want a plain `<a href>` to stay a full document load, so that the navigation boundary is visible in my code rather than hidden in a global listener.
12. As an app developer, I want external URLs, modifier clicks, non-primary buttons, `target`, `download`, and `data-hybrid-nav="off"`-style opt-outs to keep native behavior in `<Link>`, so that browser conventions are never broken by the framework.
13. As an app developer, I want focus moved to the page region and the swap announced through a live region, so that client navigations are usable with assistive technology.
14. As an app developer, I want a hash-only change to keep native anchor behavior, so that in-page links are never hijacked.

### Traversal

15. As an app developer, I want browser Back/Forward to swap pages via descriptor after a client-side navigation, so that traversals feel like Next.js rather than full reloads.
16. As an app developer, I want scroll position restored when traversing back to a page I scrolled, so that Back behaves like the browser, not like a fresh visit.
17. As an app developer, I want Back/Forward on a URL the client never navigated to be an ordinary document load, so that cold entries behave exactly as today.
18. As an app developer, I want a failed traversal to degrade to a document load of the target URL, so that history is never broken by the machinery.

### Server core

19. As an app developer, I want the server core to compile straight from the installed framework package, so that my project tree contains no frozen framework copies.
20. As an app developer, I want the server core files visible in my IDE (under a Framework link) and on GitHub, so that I can read `RoutePolicy` and the filters as teaching material — the point of a starter framework.
21. As an app developer, I want `pnpm update @rubichandrap/poyo` to deliver server-side framework fixes, so that upgrading is one command with no scaffold or copy step.
22. As an app developer, I want a clear build error pointing at `pnpm install` when the framework package is missing, so that the one failure mode of the in-place design is an instruction, not a mystery.
23. As a framework maintainer, I want the wire literal and framework namespace never touched by the scaffolder's rename, so that generated projects keep the descriptor contract by construction rather than by protected-literal machinery.
24. As a framework maintainer, I want the template's server wiring to shrink to `AddPoyo()` + `MapPwoRoutes`-style registration, so that the template shows the contract, not the plumbing.
25. As an app developer with a custom controller, I want `this.PoyoPage(data)` to resolve view path, page name, and SEO from context, so that custom pages support navigation without per-action boilerplate.
26. As an app developer, I want the descriptor endpoint to be gated by `RouteAccessFilter`, so that a protected route never hands its payload to an anonymous caller.

### Registry & manifest

27. As an app developer, I want `"dynamic": false` on a route to make both the server and client treat it as document-only, so that pages with server-only behavior have an enforced off-switch, not a convention.
28. As an app developer, I want the registry validated at boot and at every CLI read for the new field, so that a malformed value fails loudly in dev, not silently in prod.
29. As an app developer, I want `routePath("Dashboard")` imported from the runtime and still compile-time checked, so that renamed or removed routes break my build, not my users.
30. As an app developer, I want `routePath` to throw a clear error when called before the route table is initialized, so that a wiring mistake names its cause.
31. As an app developer, I want `routes.generated.ts` to exist only as plumbing I never import, so that the generated file's name and location can change without breaking my app.
32. As an app developer, I want the manifest gitignored again, so that the repo convention is uniform: derived artifacts are generated, the registry is the only committed source.
33. As a fresh-clone developer, I want a missing manifest to degrade to `string`-typed route names until the first generate, so that the editor is usable before any command runs.

### Template hygiene

34. As a fresh-clone developer, I want no `index.html` in the client, so that I don't open a page that never runs and wonder where the app actually starts.
35. As a maintainer, I want the Vite build entry to be the client module itself, so that the build graph is explicit instead of an HTML-file side effect.
36. As a maintainer, I want `poyo build` to keep syncing only manifest-referenced assets, so that no HTML artifact ever lands in `wwwroot`.

### Verification

37. As a maintainer, I want the fixture e2e to prove the whole feature on a scaffolded project — server core compiled from node_modules, descriptor JSON + `Vary`, opt-out answering the document, protected descriptor challenging, router and `Link` in the bundle, no committed manifest, no `index.html` — so that the release is verified at the highest seam, not by hand.
38. As a maintainer, I want the runtime, CLI, scaffolder, and C# suites to cover their existing seams, so that no new test infrastructure is introduced for this feature.

## Implementation Decisions

- **Delivery shape (ADR 0008)**: the server core ships as source inside the framework package under `server/` (`RoutePolicy`, `RouteDefinition`, `RouteAccessFilter`, `SeoPolicyFilter`, `PageResult`, `PageController`, controller extensions, `AddPoyo()`/`MapPoyoRoutes()`); the server project compiles it in place via a csproj include over the installed package path with `LinkBase`, plus a defensive `Compile Remove` for `node_modules` globs. A verified spike (dotnet 10.0.401) proved MSBuild follows the pnpm symlink; Windows junction behavior gets one confirmation on a Windows box (failure mode: loud build error, not silent breakage). An `Exists` guard + `<Error>` target fails the build with "run `pnpm install`" when the package is missing. Fixed namespace `Poyo.Framework`; the folder joins the package's `files` whitelist. Rejected: CLI-managed copy (reintroduces frozen copies), compiled DLL (hides teaching material), NuGet package (no feed, no account).
- **Wire contract (ADR 0009)**: descriptor request = `X-Poyo-Navigation: 1` header; response = JSON `{ name, seo, pageData }` with `Vary: X-Poyo-Navigation`; `pageData` serialized byte-identical to the document's `window.SERVER_DATA` payload. `PageResult` (a `ViewResult` subclass) is the single result type: descriptor request + registry route with dynamic enabled → JSON; otherwise the document exactly as today. `RouteAccessFilter` runs before the result executes, so enforcement precedes the descriptor. `PageController` resolves page name/SEO and answers `NotFound()` on a missing view path. Custom controllers use `this.PoyoPage(data)`.
- **Registry (ADR 0009)**: one new field, `"dynamic"` (boolean, default true), validated by the CLI registry validator and the server's boot validation — junk values fail with the route named. `head` additions are deliberately cut: Poyo's client is a single Vite bundle, so per-route stylesheets have no consumer; the field is additive later without breaking the wire contract.
- **Client runtime (ADR 0009)**: navigation core = descriptor fetch → shape-check parse (top-level only; unknown bodies → fallback) → route-table lookup → store commit → history write (`pushState`/`replaceState`) → SEO apply → focus + live-region announcement → scroll handling. Two drivers only: the `useRouter` methods and `Link`'s click handler. Traversal via `popstate` only (no Navigation API interception), with hash-only-change skip and last-write-wins supersede tokens; history entries store scroll position for traversal restore; `history.scrollRestoration = "manual"` while installed. `usePage` reads the runtime's navigation store; the global seeds it on first load. Failures degrade to `location.assign`/`reload` of the same URL. API surface: `Link` from the link subpath, `useRouter`/`createRouter` from the router subpath, both re-exported from the runtime root.
- **Manifest encapsulation (ADR 0010)**: the emitter writes an ambient module augmentation of a runtime-declared `PoyoRouteRegistry` interface (names/paths as literal unions from the registry); the runtime derives `RouteName`/`RoutePath` (defaulting to `string` pre-augmentation) and exports `routePath()` resolved from the active route table, with an init guard erroring before registration. `Link`'s href type accepts `RoutePath | (string & {})`. The template's pages import `routePath` from the runtime; the manifest is gitignored again (supersedes ADR 0007's committed-artifact consequence; the emit machinery — regenerate on every route command and `poyo generate` — is unchanged).
- **Template hygiene**: `index.html` deleted; Vite `rollupOptions.input` points at the client entry module (the Razor views own `#react-root`, `data-page-name`, and the script tags; `poyo build` syncs only manifest-referenced assets, so no HTML artifact deploys). The template's server loses its frozen framework files and its ~30 lines of routing wiring; `GlobalExceptionHandler` stays app-side (per-app customization surface). The ownership test, for future decisions: anything that reads the registry or speaks the wire contract is framework (bundled); anything that renders views or holds credentials is app (template).
- **Cross-cutting invariants**: rename-safety by construction (the scaffolder never rewrites `node_modules`; no protected-literal machinery needed); the descriptor shape and header literal are wire contract — changes must be backward-compatible or ship with a CLI release note; `pnpm update` runs no generate hooks, so registry-shape changes stay additive.

## Testing Decisions

- A good test asserts external behavior at the seam, not implementation: what the CLI writes, what a served URL answers, what a rendered page or built bundle contains, what a hook returns for a given environment. No internal-unit assertions on private helpers.
- **Seams (confirmed by the maintainer — all four exist; zero new test infrastructure):**
  1. **Fixture e2e** (highest, extended in place): scaffold → install → build → serve, asserting the server core compiled from node_modules in the scaffolded project, descriptor JSON + `Vary` on the reference route, the opt-out route answering the document, the protected route challenging without auth, router/`Link`/runtime-`routePath` in the built bundle, and no committed manifest or `index.html`. Prior art: the existing fixture's descriptor-style assertions and minifier-stable bundle anchoring.
  2. **`packages/poyo` vitest**: runtime behavior through the existing env fakes (push/replace commit, traversal + scroll restore, hash-only skip, supersede token, init guard, `Link` click rules); CLI acceptance of `"dynamic"` and rejection of malformed values; the emitter's augmentation shape. Prior art: the package's 13 vitest files and `runtime.test.ts`.
  3. **`Poyo.Server.Tests`**: boot validation of the new registry field, the `PageResult` descriptor/document split, and the access-filter-before-descriptor interaction via the existing server fixtures. Prior art: `RoutePolicyTests`, `MissingViewRouteTests`, `AccessPolicyIntegrationTests`.
  4. **Scaffolder `scaffold.test.ts`**: red-green on the generated shape — csproj include present, manifest un-committed, no `index.html`. Prior art: the existing red-green rewrite assertions.
- The node_modules-include question ("does the code live in the package?") is proven by seam 1 on a real scaffold, not by unit tests of path logic.

## Out of Scope

- `head` additions in the registry/descriptor (cut for v1 — additive later without breaking the wire contract).
- Navigation API `event.intercept` and any global interception/eligibility net over plain anchors; guarded-click machinery.
- Consuming-app model, page-scoped CSS, per-route meta/og updates on navigation.
- Server-rendered React, HTML fragments, or any HTML in the descriptor (the page DOM stays owned by React; no injection sink).
- Changing the access model, the JSend API format, the auth service, or `GlobalExceptionHandler` behavior.
- Migrating existing generated projects (standalone copies, untouched) and any Pwo-side changes (its own `index.html`/NuGet model is a separate repo decision).
- Windows-junction verification of the csproj include (one command on a Windows box, recorded in ADR 0008; failure mode is a loud build error).

## Further Notes

- Decided in a grilling session against the JsxCore distribution analysis: JsxCore carries its unpublished core inside the one NuGet artifact consumers install (embedded resources, `buildTransitive` packing, a native npm client) — Poyo applies the same "one carrier" principle with the npm package as carrier and the CLI playing the role JsxCore's MSBuild targets play.
- Pwo's ADR-0007 deferred server-side descriptor enforcement; Poyo ships it enforced from day one — the access filter precedes the descriptor, which is the one place this port is deliberately ahead of the reference implementation.
- The glossary gained **Dynamic navigation** (the maintainer's term, replacing Pwo's provisional "hybrid navigation"), **Router**, and **Server core**; **Page data**, **Route**, **Route table**, and **Framework package** entries were updated. The registry field is `dynamic`, not `hybrid` — the registry speaks the glossary.
- Docs to update in the same change: AGENTS.md (§2 controller strategy, §3.7 route resolution, §4 route management), README (features, core concepts, what's included), package READMEs, CHANGELOGs.
- Related already-done work in this session: `index.html` deleted and the Vite entry pointed at the client module (verified through the full client build + `poyo build` sync chain); ADRs 0008–0010 and the glossary updates are already on disk.

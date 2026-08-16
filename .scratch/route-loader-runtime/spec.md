# Spec — Route resolution ships in the framework's client runtime

ADR: docs/adr/0006-route-resolution-in-client-runtime.md
Prior art: Pwo ADR-0005 (implemented, published 0.0.5) — same contract, different package model.

## Problem Statement

The client route loader (`poyo.client/src/routes/route-loader.ts`) is framework machinery living in the template: it globs `src/pages/**/*.page.tsx` via Vite's `import.meta.glob`, imports `routes.json` as JSON, builds lazy route maps, and implements `findRouteByName`/`findRouteGeneric` plus dev-only ghost detection. Every generated project copies this logic wholesale and ships it privately — bugs and improvements in route resolution reach projects only through template releases, and no generated project can upgrade it independently. `usePage` had the same problem and was moved into the framework package (ADR 0005); route resolution is the same category of code and gets the same treatment.

## Solution

`createRouteTable` joins `usePage` under `@rubichandrap/poyo/runtime` (new sibling module `src/runtime/route-table.ts`, re-exported from the runtime index). The template's `route-loader.ts` slims down to the Vite boundary — glob, re-key, base-path resolution, and the `createRouteTable` call — keeping its file name and re-exporting the legacy API so consumers don't churn. `poyo generate` emits a typed route manifest (`src/routes/routes.generated.ts`, gitignored per the Pwo convention) with `RouteName`/`RoutePath` literal unions and a `routePath()` helper; every route-mutating CLI command re-emits it. The server injects the app base path (`data-base-path` = `Url.Content("~/")` on `<body>`), so subpath deployments cannot silently 404.

## User Stories

1. As an app developer, I want the route loader to come from `@rubichandrap/poyo/runtime`, so that my generated project stops carrying a private copy of framework logic.
2. As an app developer, I want `findRouteByName` to return an `AppRoute` with `access` from the registry, so that app code never hardcodes paths or access levels.
3. As an app developer, I want the server-declared page name to bind to its lazy component even under a subpath deployment, so that base-path handling cannot silently point at the wrong root.
4. As an app developer, I want a registry entry pointing at a missing page file to warn and skip only that route, so that one bad entry cannot blank the whole app.
5. As an app developer, I want an unknown server-declared page name to render "Page not found" and be loud in dev, so that deploy skew is visible instead of silent.
6. As an app developer, I want static links to use the typed `routePath` helper, so that a renamed or removed route is a build error rather than a 404.
7. As an app developer, I want the base path to come from the server, so that links and dev URL matching always use the server's hosting path.
8. As a maintainer, I want the route machinery in one home in the framework package, so that fixes ship through package upgrades instead of template releases.
9. As a maintainer, I want `poyo generate` and every route command to emit the manifest, so that it never goes stale.
10. As a maintainer, I want the fixture e2e to assert the route API resolves from the published package, so that the release is verified end-to-end.

## Implementation Decisions

- `createRouteTable(manifest: readonly RouteEntry[], loaders: PageLoaders, options: RouteTableOptions): RouteTable` lives in `packages/poyo/src/runtime/route-table.ts` as a sibling module of `use-page.ts`, re-exported from the runtime index — same `./runtime` subpath, same "one API per module" convention. No new package, no new subpath, no release-pipeline change.
- `RouteEntry` mirrors the registry shape: `path`, `name`, `files { react, view }`, optional `access` (`"public" | "guest" | "protected"`, default `"protected"`), `controller`, `action`, `seo`. The runtime trusts the producer — `RoutePolicy` validates the registry at server boot, the CLI validates on every read.
- Return contract: `{ routes: AppRoute[], routeMap: Record<name, component>, findRouteByName, findRouteGeneric, detectGhostRoutes }`. Exact-name lookup first with a case-insensitive fallback map (first-inserted wins, preserving historical order); a miss reports through `onError` in dev only. `findRouteGeneric` normalizes the pathname (strip base path case-insensitively, strip trailing slash, case-insensitive match against registry paths). Missing loader → `warn` + skip. Ghost detection warns in dev for loader keys absent from the manifest. `baseUrl` accepts a path or a full URL (`normalizeBasePath` extracts the pathname). `onWarn`/`onError` default to `console.warn`/`console.error`.
- The module stays dependency-free apart from `react` (peer, `lazy` value import — same as the Pwo implementation); no Node imports, browser-safe.
- The template adapter keeps the file name `route-loader.ts` and re-exports the legacy surface (`routes`, `routeMap`, `findRouteByName`, `findRouteGeneric`, `AppRoute` type) so `app.tsx` and `routes/index.tsx` import from the same place. `RouteComponent` (Suspense + loading fallback) stays in the template — UI, not framework.
- `app.tsx` updates to the new contract: server page name → `findRouteByName`; standalone-dev fallback → `findRouteGeneric(window.location.pathname)`; no match → "Page not found" UI. The hardcoded Home fallback (`React.lazy(() => import("./pages/Home/index.page"))`) is removed — it bypasses the registry and is exactly the drift class the runtime exists to kill.
- Mount root id unifies to `react-root` (Register already uses it; Dashboard/Login/Home views switch from `#root`). `app.tsx` reads `#react-root` like the Pwo adapter.
- Base path: `_Layout.cshtml` renders `data-base-path="@Url.Content("~/")"` on `<body>`; the adapter reads `mountRoot.dataset.basePath ?? document.body.dataset.basePath ?? BASE_URL`. A tiny `src/lib/base-url.ts` (mirroring Pwo) provides `BASE_URL` (`VITE_BASE_URL ?? "/"`, trailing-slash normalized) and `appUrl(path)` (root-safe join) for static links.
- Codegen: `writeRouteManifest(paths)` in `packages/poyo/src/route-manifest.ts`, called from the `generate` command and from `route add/remove/update/sync` after mutation. Emits `src/routes/routes.generated.ts`: `as const satisfies readonly RouteEntry[]`, `RouteName`/`RoutePath` unions, `routePath(name)` helper; empty registry → `never` unions (valid TS). The file is **gitignored** (Pwo convention): a derived artifact regenerated at every entry point can never lie. `poyo generate` splits its behavior: the route manifest always emits; the OpenAPI codegen runs only when a source is provided (no source → skip with a notice, not an error). The template client gains `predev`/`prebuild` = `poyo generate`, so fresh clones and scaffolded projects self-heal on the first command. Accepted cost: editor/type-check red until generate has run (Pwo parity).
- Static links on Home/Login pages adopt `routePath` + `appUrl` (e.g. `appUrl(routePath("Login"))`), so route renames break the build.
- Release: additive minor, ships as 0.3.0 together with the pending framework-runtime work; no version bump in feature commits (lockstep bump happens in the release commit).

## Testing Decisions

- `packages/poyo` vitest — new `test/route-table.test.ts` covers the contract: missing loader → warn + skipped route; exact-name priority over case-insensitive fallback; unknown name → `undefined` + `onError` only when `dev`; `onWarn`/`onError` channels are honored; base-path stripping (root `"/"`, subpath, full-URL base, trailing slashes); `findRouteGeneric` normalization; ghost detection dev-only; empty manifest; `access` defaulting to `protected`. No DOM needed — the module is pure.
- `test/generate.test.ts` (existing seam) gains the route-manifest emitter cases: literal unions, `routePath` map, empty-registry `never`, header comment; compilability is proven by `poyo.client type-check` (workspace link against the built package).
- `poyo.client type-check` + `build` green after the adapter/consumer changes; type-check requires `poyo generate` to have run first (the manifest is gitignored), while `build` regenerates it via `prebuild`; `pnpm run lint && pnpm run format` green.
- Fixture e2e (`scripts/fixture-e2e.test.mjs`): extend to assert the resolved package ships `dist/runtime/route-table.js` and the built client bundle carries `createRouteTable`. Red until 0.3.0 is published (the existing npm-resolution gate behavior).
- Scaffolder: no seam changes — `routes.generated.ts` rides along in the template copy when present on disk (the scaffolder copies the working tree / tarball contents, not git); if the published tarball lacks it, the scaffolded project self-heals via its `predev`/`prebuild`. The client already declares `@rubichandrap/poyo` as `workspace:*` and is rewritten at generate time.

## Out of Scope

- Server routing: `RoutePolicy`, `RouteAccessFilter`, `SeoPolicyFilter`, and the MVC side are untouched (only the `data-base-path` attribute is added to the layout).
- Access enforcement semantics: `AppRoute.access` is informational client-side data; enforcement stays server-side.
- Client-side navigation / a router; the per-load binding contract is unchanged.
- Migrating existing generated projects — they are standalone copies and keep their private loaders.
- Adopting Pwo's separate `@pwo/runtime` package model — ADR 0005 pinned the subpath model.
- `poyo build` (asset sync) — unchanged; only `generate` and route commands emit the manifest.

## Further Notes

- CONTEXT.md glossary (final wording, agreed in the grilling session):
  - "Routes registry" — definition unchanged; the avoid-note drops "route table" (that term now names a real concept) and becomes `_Avoid_: route map, route config`.
  - "Route table" (new) — the client runtime's per-load binding produced by `createRouteTable`: the registry mapped to lazy components plus name/path lookups; derived from the registry, never the source of truth. `_Avoid_: routes registry`.
  - "Route loader" (new) — the thin Vite-boundary adapter in generated projects (`src/routes/route-loader.ts`): globs page files, resolves the base path, calls `createRouteTable`, and re-exports its API. `_Avoid_: route engine, route resolver`.
- The Register view already uses `react-root` — the unification is one line per remaining view.
- Pwo's fixture e2e proved the publish-order pitfall (404 until the package is published); this gate stays red until 0.3.0 lands on npm — by design.

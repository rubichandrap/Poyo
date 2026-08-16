# 03 — Route table codegen

**What to build:** poyo generate emits src/routes/routes.generated.ts via a new writeRouteManifest emitter (packages/poyo/src/route-manifest.ts): the registry as as const satisfies readonly RouteEntry[], RouteName/RoutePath literal unions, routePath(name) helper, header comment; empty registry → never unions. The file is gitignored (Pwo convention): derived artifact, regenerated at every entry point. poyo generate splits its behavior — route manifest always emits, OpenAPI codegen only with a source (no source → skip with a notice, not an error). Template client gains predev/prebuild = poyo generate so fresh clones and scaffolded projects self-heal. route add/remove/update/sync re-emit after mutation. Static links on Home/Login pages adopt routePath + appUrl join (new tiny src/lib/base-url.ts: BASE_URL + root-safe appUrl).

**Blocked by:** 02 (the adapter imports the generated manifest)

**Status:** done — implemented on feat/01-route-table-runtime (commit 4740359)

- [x] writeRouteManifest emits literal unions, routePath map, never unions for empty registry
- [x] generate splits: manifest always; OpenAPI only with source (no throw when absent)
- [x] predev/prebuild = poyo generate in the template client
- [x] routes.generated.ts gitignored; route commands re-emit; tests in generate.test.ts
- [x] Home/Login static links use routePath/appUrl (route rename = build error)

GitHub: —

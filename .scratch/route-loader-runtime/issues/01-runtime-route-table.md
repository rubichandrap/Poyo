# 01 — Route table in the client runtime (createRouteTable)

**What to build:** The framework package @rubichandrap/poyo ships route resolution as a new sibling module src/runtime/route-table.ts, re-exported from the ./runtime index: RouteEntry/PageLoader/PageLoaders/AppRoute/RouteTable types and createRouteTable(manifest, pageLoaders, { baseUrl, dev, onWarn, onError }) returning { routes, routeMap, findRouteByName, findRouteGeneric, detectGhostRoutes }. Exact-name lookup with case-insensitive fallback; unknown name → onError in dev; missing loader → warn + skip; ghost detection dev-only; normalizeBasePath accepts path or full URL; access defaults to "protected"; react stays the only import source (peer).

**Blocked by:** None — can start immediately

**Status:** done — implemented on feat/01-route-table-runtime (commit c9d6419)

- [x] src/runtime/route-table.ts implements the full contract (ADR 0006)
- [x] runtime index.ts re-exports createRouteTable + all types (single public face)
- [x] test/route-table.test.ts covers: warn+skip on missing loader, exact-over-ci priority, onError only in dev, base-path stripping (root/subpath/full URL), ghost detection dev-only, empty manifest, access default
- [x] packages/poyo build + test green; runtime module stays dependency-free (browser-safe)

GitHub: —

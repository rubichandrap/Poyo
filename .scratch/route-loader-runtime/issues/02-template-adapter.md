# 02 — Template adapter + consumer update

**What to build:** route-loader.ts in the template slims down to the Vite boundary (~40 lines): import.meta.glob, re-key glob keys into registry space ("../pages/" → "src/pages/"), resolve base path (mountRoot/body data-base-path → VITE_BASE_URL → "/"), call createRouteTable, and re-export the legacy surface (routes, routeMap, findRouteByName, findRouteGeneric, AppRoute) so existing imports keep working. app.tsx switches to AppRoute returns: server page name → findRouteByName; standalone-dev → findRouteGeneric; miss → "Page not found". The hardcoded Home fallback and the manual component wrapper are removed. Mount root id unifies to react-root (Dashboard/Login/Home views switch from #root; Register already uses it). RouteComponent stays as-is.

**Blocked by:** 01 (resolved)

**Status:** done — implemented on feat/01-route-table-runtime (uncommitted at time of writing)

- [x] route-loader.ts is a thin adapter re-exporting the legacy API (file name kept)
- [x] app.tsx uses AppRoute returns; Home fallback removed; "Page not found" on miss
- [x] Views Dashboard/Login/Home use id="react-root"
- [x] poyo.client type-check + build green; lint/format green

GitHub: —

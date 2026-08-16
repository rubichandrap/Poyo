# 04 — Server-injected base path + fixture e2e

**What to build:** _Layout.cshtml renders data-base-path="@Url.Content("~/")" on <body> so the client binds to the server's real hosting path (VITE_BASE_URL stays the standalone-dev fallback only). The fixture e2e (scripts/fixture-e2e.test.mjs) extends its assertions: the resolved package ships dist/runtime/route-table.js and the built client bundle carries the route-table module — anchored on its [RouteTable] diagnostic prefix, because the production minifier renames the createRouteTable identifier — red until the release version is published, by design (same gate as the existing npm-resolution proof).

**Blocked by:** 02 (adapter consumes the base path)

**Status:** done — implemented on feat/01-route-table-runtime

- [x] _Layout.cshtml renders data-base-path from Url.Content("~/")
- [x] Adapter resolves baseUrl: dataset → VITE_BASE_URL → "/" (already landed in issue 02's commit b037015)
- [x] fixture e2e asserts dist/runtime/route-table.js + [RouteTable] in the bundle (minifier renames createRouteTable; the diagnostic prefix is the stable anchor)
- [x] Fixture confirmed red pre-publish (0.2.0 published-but-old → runtime-subpath assertion, not [RED-UNTIL-PUBLISHED]; the gate stays red until a version shipping dist/runtime/ is published)

GitHub: —

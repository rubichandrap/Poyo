# 05 — Docs match shipped shape

**What to build:** Update the docs so they describe the shipped state: AGENTS.md §4 (route management — route-loader is now a thin adapter; route resolution ships from the framework runtime; routes.generated.ts is generated and gitignored) and §3.2/§3.3 wording if needed; READMEs (package table notes the runtime now covers route resolution). CONTEXT.md glossary — final wording agreed in the grilling session: "Routes registry" definition unchanged, avoid-note drops "route table" (that term now names a real concept) and becomes `_Avoid_: route map, route config`; new "Route table" term (the client runtime's per-load binding produced by createRouteTable; derived from the registry, never the source of truth; `_Avoid_: routes registry`); new "Route loader" term (the thin Vite-boundary adapter in generated projects — globs page files, resolves the base path, calls createRouteTable, re-exports its API; `_Avoid_: route engine, route resolver`). CHANGELOG entries land in the release commit (0.3.0), not feature commits.

**Blocked by:** 01-04

**Status:** done — implemented on feat/01-route-table-runtime

- [x] AGENTS.md describes the adapter + runtime-owned resolution
- [x] READMEs updated; CONTEXT.md glossary gets Route loader / Route table terms + registry avoid-note reword
- [x] CHANGELOG entries prepared for the 0.3.0 release commit
- [x] Docs reviewed against the implemented diff (no drift)

GitHub: —

# 07 — Docs and changelog alignment

**What to build:** The written architecture matches the shipped architecture. The agent constitution's controller strategy, client route-resolution section, and route-management chapter are updated for the bundled server core, the dynamic navigation contract, and the runtime-owned typed routes; the root and package READMEs describe the new surface (navigation subpaths, the `dynamic` field, the in-place server core, what's included/no-longer-included); every changelog gains its entry under the release that ships the feature. The glossary and ADRs are already current — this ticket brings the rest of the docs to them.

**Blocked by:** 01 — Server core bundles; 02 — Registry `dynamic`; 03 — Manifest encapsulation; 04 — Dynamic navigation; 05 — Traversal; 06 — Fixture e2e

**Status:** ready-for-agent

- [ ] AGENTS.md: controller strategy reflects the bundled page result/controller and the custom-controller helper; route resolution reflects the runtime-owned typed routes and navigation subpaths; route management documents the `dynamic` field
- [ ] Root README: features, core concepts (dynamic navigation section), what's-included list, and project structure match the shipped shape
- [ ] Package READMEs updated (framework package: server core + runtime subpaths; template: no manifest/no index HTML, dev loop unchanged)
- [ ] CHANGELOGs (root + three packages) carry the feature entry in Keep a Changelog form
- [ ] No doc claims the manifest is committed or that the client ships an index HTML; no doc implies NuGet delivery of the server core

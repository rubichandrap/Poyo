# 03 — feat(poyo): route management commands in new TS CLI

**What to build:** A developer can manage routes from the new `@rubichandrap/poyo` project CLI — `poyo route add`, `update`, `remove`, `sync` — ported from the old Node route manager. The template declares the project CLI as a dev dependency and uses its route commands; the old route script is deleted.

**Blocked by:** 02 — restructure into packages monorepo.

**Status:** done

- [x] `packages/poyo` is a TypeScript CLI compiled with `tsc` to `dist/`, with heavy dependencies loaded lazily (fast startup).
- [x] `poyo route add <path>` registers the route in the routes registry (sorted by path) and scaffolds the React page and MVC view, honoring `--public`, `--guest`, `--flat`, `--controller`/`--action`, and `--no-view`; duplicate paths rejected with a clear error.
- [x] `poyo route remove <path>` removes the route and, after confirmation, deletes page/view/controller files (reporting orphans when deletion is declined).
- [x] `poyo route update <path>` toggles `--public`/`--guest`.
- [x] `poyo route sync` detects missing files and untracked pages/views, offering rescaffold/prune/add/delete flows.
- [x] The template `package.json` declares `@rubichandrap/poyo` as a dev dependency (`workspace:*`) and its route scripts call `poyo`; `scripts/manage-routes.js` is deleted.
- [x] Tests at the CLI seam: route commands run as child processes against a temp fixture project, asserting written files and `routes.json` content.

# 03 — Manifest encapsulation: the runtime owns `routePath`

**What to build:** The generated route manifest stops being app API. The emitter writes an ambient type augmentation (the registry's names and paths as literal unions inside a runtime-declared registry interface); the runtime derives the typed route names/paths (defaulting to plain strings before augmentation) and exports the typed `routePath` helper, resolved from the active route table the route loader registers — with a clear initialization error if called before registration. Template pages import `routePath` from the runtime, never from the generated file; the manifest returns to gitignored. The generated file's name and location stop being API; a missing manifest just degrades route-name typing until the first generate.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The emitter's output is the augmentation shape only (no exported manifest values); every route command and generate still re-emits it
- [ ] The runtime exports `RouteName`/`RoutePath` (string fallback pre-augmentation) and a typed `routePath()` resolved from the active route table
- [ ] Calling `routePath` before the route table registers fails with a clear "route table not initialized" error
- [ ] Template pages import `routePath` from the runtime; no file under the client's source imports the generated file
- [ ] The manifest is gitignored again and removed from the committed tree; the generated shape stays valid TypeScript for an empty registry
- [ ] A stale or wrong route name in app code is a compile error (the typed-route guarantee survives the move)
- [ ] Runtime tests cover the typed helper and init guard; CLI tests cover the emitter's augmentation output

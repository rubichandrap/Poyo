# 02 — Commit the client route table at the client package root

**What to build:** The typed route table becomes a committed artifact of generated projects. Fresh scaffolds and fresh clones have `routes.generated.ts` on disk from the first moment: the editor resolves it immediately, `type-check` passes out of the box, `pnpm route …` commands keep it fresh, and a stale route name fails the build through the literal route-name types. The route table lives at `<client>/routes.generated.ts` and ships inside the published template. Hook `"predev": "poyo generate"` is removed from client `package.json`.

**Blocked by:** None — can start immediately.

**Status:** closed

- [x] Route-manifest emitter writes to client package root (`<client>/routes.generated.ts`)
- [x] `routes.generated.ts` is un-ignored in `.gitignore` and committed in `packages/poyo-template/poyo.client/`
- [x] `"predev": "poyo generate"` removed from `packages/poyo-template/poyo.client/package.json`
- [x] Template imports (`src/routes/route-loader.ts`, pages) resolve `routes.generated` from `../../routes.generated` or `~/routes.generated`
- [x] CLI unit test suite covers the new emitter target and passes offline
- [x] Scaffolder unit suite covers that a copied fixture carries the route table
- [x] A freshly scaffolded fixture type-checks without any generate step

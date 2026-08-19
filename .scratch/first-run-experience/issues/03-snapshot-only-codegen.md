# 03 — Offline OpenAPI resolution: snapshot-only codegen

**What to build:** `poyo generate` becomes fully offline. The committed OpenAPI snapshot (`<client>/openapi/openapi.json`) is the single source for schema codegen — no environment URL, no network — so builds and CI never depend on a running API server. A positional argument remains an explicit one-off override, and a missing snapshot fails with a descriptive error. Generated schemas (`dtos.generated.ts` and `validations.generated.ts`) are gitignored.

**Blocked by:** 02 — Commit the client route table at the client package root.

**Status:** closed

- [x] OpenAPI source resolution in `poyo generate` reads committed snapshot `openapi/openapi.json` only
- [x] `VITE_OPENAPI_URL` and ambient network calls removed from `poyo generate`
- [x] Positional override still works for one-off documents (`poyo generate ./custom-spec.json`)
- [x] Missing snapshot yields a descriptive CLI error
- [x] `src/schemas/dtos.generated.ts` and `src/schemas/validations.generated.ts` added to `.gitignore`
- [x] `openapi/openapi.json` committed in `packages/poyo-template/poyo.client/openapi/`
- [x] CLI unit suite proves codegen runs with no network access and ignores any environment URL

# 06 — Fixture e2e: first-run builds and serves without a server

**What to build:** The fixture E2E test proves the whole first-run story end-to-end: a fresh scaffold carries the committed route table at the client package root (not gitignored), the fixture builds offline with no API server running, a server boot writes a valid OpenAPI snapshot in-process, and the served page still binds `data-page-name` and `data-base-path` to the client runtime.

**Blocked by:** 02, 03, 04, 05

**Status:** closed

- [x] Fixture e2e asserts a fresh scaffold has `routes.generated.ts` at client root and is not gitignored
- [x] Fixture builds offline without any live API server or network requests
- [x] Server boot produces a valid OpenAPI snapshot at `openapi/openapi.json`
- [x] Served HTML declares page name and base path, and hydration binds properly
- [x] Full fixture test suite (`pnpm run test:release`) green (configured release gate)


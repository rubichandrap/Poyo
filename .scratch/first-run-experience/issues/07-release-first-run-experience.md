# 07 — Release: first-run-experience lockstep publish

**What to build:** The first-run experience ships to npm. Template, CLI, scaffolder, and runtime move in one lockstep version with CHANGELOG entries; versions are verified, and the release fixture e2e runs against the release version.

**Blocked by:** 06 — Fixture e2e: first-run builds and serves without a server.

**Status:** open

- [ ] Lockstep version bump across all three packages (`@rubichandrap/poyo`, `@rubichandrap/poyo-template`, `@rubichandrap/create-poyo-app`)
- [ ] CHANGELOG.md entries in root and package folders
- [ ] Lockstep assertion tests pass (`pnpm run release:check`)
- [ ] Fixture e2e tests pass (`pnpm run test:release`)

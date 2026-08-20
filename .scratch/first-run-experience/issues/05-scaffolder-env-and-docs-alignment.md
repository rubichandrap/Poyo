# 05 — Scaffolder env bootstrap and documentation alignment

**What to build:**
1. `create-poyo-app` automatically copies `.env.example` to `.env` during project scaffolding if `.env` does not exist.
2. Update documentation across all README files (`README.md`, `packages/poyo-template/README.md`, `packages/create-poyo-app/README.md`) to:
   - Use `npx @rubichandrap/create-poyo-app@latest MyApp` (and `pnpm create @rubichandrap/poyo-app@latest` / `pnpm dlx`).
   - Prioritize `pnpm run server:watch` (or `pnpm run dev:watch`) as the recommended command for full-stack MPA development.
   - Clarify the offline `pnpm run generate` workflow and in-process OpenAPI snapshot generation.

**Blocked by:** 02, 03, 04

**Status:** closed

- [x] Scaffolder (`packages/create-poyo-app/src/index.ts`) copies `.env.example` to `.env`
- [x] Root `README.md` updated with `@latest` command and `pnpm run server:watch`
- [x] `packages/poyo-template/README.md` updated with dev workflow and `@latest` references
- [x] `packages/create-poyo-app/README.md` updated with `@latest` invocation
- [x] Scaffolder unit test suite verifies `.env` creation

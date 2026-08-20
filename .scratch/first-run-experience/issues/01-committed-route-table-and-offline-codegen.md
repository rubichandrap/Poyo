# 01 — First-run experience: committed client route table + offline codegen

Type: task
Status: closed
Blocked by: (none)

Spec: `.scratch/first-run-experience/spec.md`

## Problem

A fresh scaffold or clone of Poyo has a broken first-run experience:
1. `routes.generated.ts` is gitignored and missing on disk until a generate command runs, causing TypeScript errors immediately when opened in an editor.
2. `poyo.client/package.json` runs `"predev": "poyo generate"`, which attempts to fetch `VITE_OPENAPI_URL` during `pnpm run server:watch` / `dotnet watch run`, causing a fatal circular deadlock with `UseViteDevelopmentServer(true)`.
3. Scaffolder does not copy `.env.example` to `.env`.
4. Documentation does not recommend `@latest` for `create-poyo-app` or highlight `server:watch` as the primary dev workflow.

## Fix (suggested)

1. **Committed client route table**: Move `routes.generated.ts` to `<client>/routes.generated.ts`, remove from `.gitignore`, remove `"predev"` from `poyo.client/package.json`, update `route-loader.ts` imports.
2. **Snapshot-only OpenAPI codegen**: `poyo generate` reads `<client>/openapi/openapi.json` offline with no network calls. Gitignore `dtos.generated.ts` and `validations.generated.ts`.
3. **In-process snapshot export**: Add `OpenApiSnapshotExportHostedService` to `Poyo.Server` to serialize OpenAPI document in-process on server boot (Development/Staging) without loopback HTTP fetches.
4. **Scaffolder & Docs**: Auto-copy `.env.example` to `.env` in `create-poyo-app`. Update README files to include `@latest` and prioritize `pnpm run server:watch`.
5. **Fixture E2E & Release**: Validate 100% offline build, in-process snapshot generation, lockstep version bump, and release gate.

## Verification

- `pnpm test` and `pnpm run test:release` pass.
- Fresh scaffold builds offline and passes type-check with zero prior generate commands.
- `pnpm run server:watch` boots cleanly without deadlock.

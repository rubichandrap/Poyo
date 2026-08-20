# First-run experience: committed client route table + offline codegen

## Problem Statement

The first run of a freshly scaffolded or freshly cloned Poyo project has critical friction points:
1. `create-poyo-app` copies the template and installs dependencies, but `routes.generated.ts` is gitignored and missing on disk. Opening the project in an editor or running `type-check` throws TypeScript module resolution errors (`Cannot find module './routes.generated'`).
2. `poyo.client/package.json` specifies `"predev": "poyo generate"`. When running `pnpm run server:watch` (or `dotnet watch run`), ASP.NET Core invokes `UseViteDevelopmentServer(true)` which boots Vite and pauses server initialization. Vite executes `predev` (`poyo generate`), which attempts to `fetch()` the OpenAPI document from `VITE_OPENAPI_URL` (`http://localhost:5104/openapi/v1.json`). Because the .NET server is blocked waiting for Vite to be ready and Vite is blocked waiting for .NET to respond over HTTP, a **circular deadlock** occurs on first run.
3. The scaffolder does not copy `.env.example` to `.env`, leaving new projects without environment configuration until manually created.
4. Documentation instructs users to run `npx @rubichandrap/create-poyo-app` without the `@latest` tag (risking stale npx cache) and emphasizes `pnpm run dev` rather than `pnpm run server:watch` (which coordinates both server and client).

## Solution

Generated artifacts and development workflows are overhauled following the proven Pwo pattern:

- The **client route table** (`routes.generated.ts`) becomes a **committed** artifact living at the **client package root** (`<client>/routes.generated.ts`), shipped inside the published template and un-ignored in `.gitignore`. Fresh scaffolds and fresh clones have it immediately on disk, ensuring green editor type-checking out-of-the-box.
- Hook `"predev": "poyo generate"` is removed from `poyo.client/package.json`. The dev server starts instantly with `"dev": "vite"`.
- `poyo generate` reads the OpenAPI document **only from the committed snapshot** (`openapi/openapi.json`) — no `VITE_OPENAPI_URL`, no ambient network calls. Codegen is deterministic and 100% offline. A positional argument remains as an explicit one-off override.
- The .NET server writes the OpenAPI snapshot **in-process** at startup (Development/Staging) via `OpenApiSnapshotExportHostedService` using `IOpenApiDocumentProvider` and `OpenApiJsonWriter` (UTF-8 without BOM). No loopback HTTP fetch, eliminating startup flakiness and deadlock.
- Schema DTOs/validators (`dtos.generated.ts`, `validations.generated.ts`) become **gitignored**, regenerated on-demand from the committed snapshot via `pnpm run generate`.
- `create-poyo-app` automatically copies `.env.example` to `.env` during scaffolding.
- Documentation is aligned: `npx @rubichandrap/create-poyo-app@latest`, `pnpm run server:watch` as the recommended primary development command.

Workflow after this lands: clone / scaffold → `pnpm run restore` → `pnpm run server:watch`. Done.

## User Stories

1. As a developer, I want a freshly scaffolded project to open in an editor with zero TypeScript errors on `routes.generated`.
2. As a developer, I want `pnpm run server:watch` on first run to boot cleanly without circular deadlocks or hanging processes.
3. As a developer, I want a fresh clone of a generated project to type-check and build without requiring a live API server.
4. As a developer, I want `poyo route add/update/remove/sync` to keep the committed route table in sync automatically.
5. As a developer, I want `poyo generate` to run completely offline from `openapi/openapi.json`.
6. As a developer, I want the .NET server to reliably refresh `openapi/openapi.json` in-process during dev boot.
7. As a developer, I want schema DTOs and validations to stay out of git version control to avoid diff churn.
8. As a developer, I want `create-poyo-app` to automatically create `.env` from `.env.example`.
9. As a developer, I want documentation to recommend `@latest` for scaffolding and `server:watch` for development.
10. As a CI pipeline, I want builds and type-checks to succeed offline without spinning up backend services.

## Implementation Decisions

- **Route table location & ownership**: `routes.generated.ts` is committed at the client package root (`<client>/routes.generated.ts`), written by `poyo route` commands and `poyo generate`. Un-ignored in template `.gitignore`.
- **Predev removal**: `"predev": "poyo generate"` removed from `poyo.client/package.json`; dev command is pure `"dev": "vite"`.
- **Offline OpenAPI codegen**: `poyo generate` reads `<client>/openapi/openapi.json`. `VITE_OPENAPI_URL` is removed from ambient resolution. `dtos.generated.ts` and `validations.generated.ts` are added to `.gitignore`.
- **In-process snapshot export**: `OpenApiSnapshotExportHostedService` registers in `Program.cs` for Development/Staging and serializes OpenAPI 3.0 via `IOpenApiDocumentProvider` directly to `<client>/openapi/openapi.json`.
- **Scaffolder bootstrap**: `create-poyo-app` copies `.env.example` to `.env` if `.env` does not exist.
- **Documentation**: Updated across root `README.md`, `packages/poyo-template/README.md`, and `packages/create-poyo-app/README.md` to use `@latest` and `pnpm run server:watch`.

## Testing Decisions

- **Unit tests**: `generate.test.ts` asserts offline codegen from snapshot and failure on missing snapshot; `route-manifest.test.ts` asserts emission to client root; `scaffold.test.ts` asserts `.env` copy and route table presence.
- **Fixture E2E**: `fixture-e2e.test.mjs` verifies fresh scaffold has committed route table, builds offline, server boot exports snapshot in-process, and page data binding serves correctly.

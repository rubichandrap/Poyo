# The client route table is a committed artifact at the client package root, with offline OpenAPI codegen

Fresh-clone and fresh-scaffold first-run experience was broken in a way that damaged the first impression of the framework. `create-poyo-app` copies the template, renames tokens, and runs `pnpm install` — it never generated anything, yet its own hint (`pnpm run dev`) immediately died with module resolution errors because `routes.generated.ts` was gitignored and missing on disk. When running `pnpm run server:watch`, ASP.NET Core invoked `UseViteDevelopmentServer(true)` which booted Vite and ran `"predev": "poyo generate"`. Because `poyo generate` attempted to fetch `VITE_OPENAPI_URL` over HTTP from a server that was still blocked waiting for Vite, a circular deadlock occurred.

We split the generated artifact families and treat them differently, adopting the exact contract from Pwo ADR-0006:
1. The **client route table** (`routes.generated.ts`) becomes a **committed** file at the **client package root** (`<client>/routes.generated.ts`), not nested in `src/routes/` and not gitignored.
2. The schema DTOs/validators (`dtos.generated.ts`, `validations.generated.ts`) become **gitignored**, regenerated offline from the committed snapshot (`<client>/openapi/openapi.json`).
3. `poyo generate` reads the OpenAPI document **only from the committed snapshot** — no `VITE_OPENAPI_URL`, no network calls. Codegen is deterministic and 100% offline. Positional argument remains as an explicit one-off override.
4. The ASP.NET Core server serializes the OpenAPI document **in-process** at startup (Development/Staging) via `OpenApiSnapshotExportHostedService` using `IOpenApiDocumentProvider` and `OpenApiJsonWriter` (UTF-8 without BOM). No loopback HTTP fetch, eliminating startup flakiness and deadlock.
5. Hook `"predev": "poyo generate"` is removed from client `package.json`.
6. `create-poyo-app` copies `.env.example` to `.env` during scaffolding.

**Why the asymmetry:** The route table is small, derived purely from the committed `routes.json`, and imported as a **value** (`routeManifest`, `routePath`) — its absence breaks both the editor and Vite dev outright. The schemas are large, churn with API changes, and are already double-sourced once `openapi.json` is committed; committing their derived TS files adds redundant diff churn. Placing `routes.generated.ts` at the client package root reflects its ownership: the server reads `routes.json` directly and never touches this file.

**Status**: accepted. Supersedes the "gitignored like the schemas" statement in ADR 0006.

**Considered options**:
- **Generate at scaffold time only** — Rejected: covers only the scaffolder user, leaving git clones and CI broken.
- **Auto-generate on `predev` with HTTP fetch** — Rejected: causes circular deadlock with ASP.NET Core's `UseViteDevelopmentServer(true)`.
- **Commit schema DTOs too** — Rejected: large churny diffs, double source of truth with committed `openapi.json`.

**Consequences**: Fresh clones and scaffolds open in editors with zero TypeScript errors; `pnpm run server:watch` boots cleanly without deadlock; builds and CI run 100% offline without live API servers; `create-poyo-app` bootstraps working `.env` files automatically; documentation recommends `create-poyo-app@latest` and `pnpm run server:watch`.

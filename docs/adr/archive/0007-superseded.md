# Archived text from ADR 0007

Superseded by ADR 0010. Kept verbatim so the history of the decision stays readable; the current decision is in [`../0007-committed-client-route-table-and-offline-codegen.md`](../0007-committed-client-route-table-and-offline-codegen.md).

1. The **client route table** (`routes.generated.ts`) becomes a **committed** file at the **client package root** (`<client>/routes.generated.ts`), not nested in `src/routes/` and not gitignored.

---

**Why the asymmetry:** The route table is small, derived purely from the committed `routes.json`, and imported as a **value** (`routeManifest`, `routePath`) — its absence breaks both the editor and Vite dev outright. The schemas are large, churn with API changes, and are already double-sourced once `openapi.json` is committed; committing their derived TS files adds redundant diff churn. Placing `routes.generated.ts` at the client package root reflects its ownership: the server reads `routes.json` directly and never touches this file.

---

**Status**: accepted. Supersedes the "gitignored like the schemas" statement in ADR 0006.

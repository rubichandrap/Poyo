# Archived text from ADR 0012

Decision 5 and the two passages that stated its 404 parity were amended on 2026-11-18: a route whose view is missing now fails the same logged 500 through `GlobalExceptionHandler` in both representations. Kept verbatim so the history of the decision stays readable; the current decision is in [`../0012-unified-page-data-production.md`](../0012-unified-page-data-production.md).

**Decision 5 (original)**:

> 5. **Non-executing view availability guard (404 parity)**: On descriptor requests (`X-Poyo-Navigation: 1`), `PageResult` queries the view engine (`ICompositeViewEngine.FindView`) before inspecting Page data. If the view does not exist on disk, the descriptor immediately returns HTTP 404 Not Found, establishing availability parity between custom and default routes and ensuring client navigation never swaps into an unavailable route that cannot render on reload.

**Considered option (original)**:

> - **Executing views to extract Page data on descriptor requests**: Rejected — double-rendering views wastes CPU and couples navigation to view rendering; a non-executing `FindView` check provides fast, fail-safe 404 availability parity without rendering.

**Consequence (original)**:

> - **Reliability**: Navigation failures for missing views fail fast with 404 before swapping client components, preventing user-facing mismatches between navigation and full reload.

# A view's `@section Head` is an SSR-only head extension

**Status**: Accepted (after 0.5.1, release candidate R11).

The layout owns the document head: the title through its template, and the registry `seo` (description, meta, JSON-LD) marked `data-poyo-seo` so the runtime can replace exactly those after a dynamic navigation (head parity). A view had no way to add a head element of its own — a canonical link, hreflang alternates, a preload. Those are document-level facts a crawler reads from a document load; they rarely matter after a client navigation, and a navigation descriptor deliberately never runs the view (ADR 0012), so it cannot carry them.

**Decision**:

1. `_Layout.cshtml` renders an optional `Head` section at the end of `<head>`: `@await RenderSectionAsync("Head", required: false)`.
2. The section is SSR-only. It is part of the document a load renders and of nothing else; descriptors are unchanged and the wire contract does not grow.
3. Elements in the section carry `data-poyo-seo`. A dynamic navigation away then removes them with the rest of the route-owned head, so a page's canonical never survives onto the next page. A dynamic navigation *into* the page does not add them; head elements that a client navigation must show belong in registry `seo`, which both sides render.

**Considered options**:

- **Put canonical/hreflang in the typed registry `seo`** — Rejected for now: they are per-request (canonical depends on host, query normalization, locale), while registry `seo` is static per route. A per-request SEO override at the `PoyoPage` seam remains the path if a client navigation ever needs them.
- **Execute the view for descriptors to collect the section** — Rejected: ADR 0012 removed view execution from descriptors for cost and correctness.

**Evidence**: `HeadSectionTests` boots the app with a test-only view that declares the section: the document head contains the element, a view without the section renders none, and the descriptor for the same route does not run the view.

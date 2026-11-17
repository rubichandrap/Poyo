# 02 — The registry learns `dynamic` end-to-end

**What to build:** The Routes registry grows exactly one field — `dynamic` (boolean, default true) — as the enforced server-side opt-out from dynamic navigation. The CLI's registry validator accepts it, every route command round-trips it untouched, and junk values fail with the route named. The server's boot validation rejects malformed values the same way, and the bundled page result honors the opt-out even when a request carries the navigation header — answering the document, never the descriptor. The field's name follows the glossary (Dynamic navigation), not the reference implementation's provisional vocabulary.

**Blocked by:** 01 — Server core bundles in the framework package

**Status:** done

**Completion:** Done. GitHub issues #43-#50 are closed. Later traversal and scroll decisions are recorded in ADR 0019.

- [x] The CLI registry validator accepts `dynamic` as a boolean, preserves it through every route command write, and rejects non-boolean values with the route named
- [x] The server's boot validation rejects a malformed `dynamic` value at startup, naming the route (consistent with the strict registry interpretation)
- [x] A descriptor request against a route with `dynamic: false` is answered with the document (the page result path), with the navigation-aware `Vary` header present
- [x] Routes without the field behave as dynamic-enabled (the default), so existing registries need no edits
- [x] CLI tests cover accept/preserve/reject through the command seam; server tests cover the opt-out at the request seam

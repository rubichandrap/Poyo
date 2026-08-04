# 01 — RoutePolicy module + server test seam

**What to build:** The server reads the routes registry through one typed module (RoutePolicy) that validates it and fails startup loudly on shape errors — malformed JSON, unknown fields, wrong types, duplicate paths. Missing view files stay a per-route runtime error, not a startup blocker. No behavior change beyond fail-loud; the registry schema is untouched (current shape). Also establishes the first server-side test seam: HTTP integration tests (WebApplicationFactory) so RoutePolicy, routing, and access behavior are verified end-to-end, not through internal units.

**Blocked by:** None — can start immediately

**Status:** done

- [x] Registry loading moves out of Program.cs into a single RoutePolicy module
- [x] Malformed registry (bad JSON, unknown field, wrong type, duplicate path) fails startup loudly with a clear message
- [x] Missing view file for a registered route does NOT block startup
- [x] All existing routes serve identically to before
- [x] First server HTTP integration tests exist and pass

GitHub: https://github.com/rubichandrap/Poyo/issues/17

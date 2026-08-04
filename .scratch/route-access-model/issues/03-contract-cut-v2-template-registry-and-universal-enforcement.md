# 03 — Contract cut: v2 template registry + universal access enforcement

**What to build:** The registry contract flips to v2 in the template and the server enforces `access` universally. Template routes.json is rewritten to `access` (Home: guest, Dashboard: protected, Login/Register: guest). RoutePolicy reads `access` and rejects legacy fields. A universal access filter enforces the policy for every registry route: protected + anonymous -> ChallengeResult (cookie config keeps LoginPath and API 401 behavior), guest + authenticated -> redirect to the configured landing page, otherwise pass. Scheme-agnostic: reads only User.Identity and the auth pipeline, so replacing the demo auth later does not touch it. A universal SEO filter applies registry `seo` to every route. PageController collapses to a single Index action; GuestOnlyAttribute is deleted (guest behavior folded into the policy). Verified end-to-end over HTTP: each access level behaves; SEO from the registry reaches the page; custom-controller routes are enforced like default ones.

**Blocked by:** 01 — RoutePolicy module + server test seam; 02 — CLI writes the v2 registry

**Status:** done

- [x] Template routes.json ships v2 (`access`) with no legacy flags
- [x] RoutePolicy maps `access` to policy, not action names
- [x] Access filter: protected+anonymous redirects to login; guest+authenticated redirects to landing; public open; API calls stay 401 (no redirect)
- [x] Access filter enforces custom-controller routes too
- [x] SEO filter applies registry seo to all routes (defaults when absent)
- [x] PageController has one Index action; GuestOnlyAttribute deleted
- [x] HTTP integration tests cover all access levels + SEO + custom-controller enforcement

GitHub: https://github.com/rubichandrap/Poyo/issues/19

# Universal access enforcement and the PageController collapse

With the registry carrying a single `access` field (ADR 0003), the server previously translated flags into controller actions: `PageController` exposed `Index` (protected) and `GuestIndex` (guest), routes were selected by name, and `GuestOnlyAttribute` was applied per action in the template controllers. Enforcement thus lived in controller code that the framework did not own, was easy to forget on new routes, and varied between default and custom controllers. We collapsed enforcement into the registry policy itself: `PageController` keeps a single `Index` action, `GuestOnlyAttribute` is deleted, and two universal MVC filters apply the registry to every route.

## Considered Options

- **Keep per-action attributes (`[Authorize]`, `[GuestOnly]`)** — Rejected: enforcement drifts from the registry (a route could be declared `public` but the action enforces otherwise), custom-controller routes were not covered uniformly, and the template shipped a framework attribute that duplicates what the registry states.
- **One filter handling access, one handling SEO, both reading the registry** — Accepted: `RouteAccessFilter` (an `IAsyncResourceFilter`) enforces the route's `access` for every registry route — default and custom-controller alike — and `SeoPolicyFilter` (an `IActionFilter`) applies the registry `seo` with the route name as the default title.

## Consequences

- `RouteAccessFilter` is scheme-agnostic: it reads only `User.Identity` and issues challenges/redirects through the auth pipeline (`ChallengeResult` for protected + anonymous, preserving the cookie config's LoginPath redirect for pages and 401 for API calls; redirect to the configured landing path for guest + authenticated), so replacing the demo auth later does not touch it.
- `PageController` collapses to one `Index(viewPath)` action; guest behavior is policy, not an action. `GuestOnlyAttribute` is deleted.
- Home becomes a normal registry route (`access: guest`, SEO in the registry); `HomeController` is deleted and the fallback default route loses its Home defaults, so unmatched URLs 404 cleanly.
- Every route is governed by the same code path — the failure mode for a wrongly-declared route is a wrong redirect, not an accidentally-open page.

## Amendment — the landing path is checked at boot (after 0.5.1, release candidate R09)

The guest redirect's target, `Routes:LandingPath` (default `/Dashboard`), was never checked. Two values break the redirect it exists for, and both showed only once a signed-in visitor reached a guest page: a guest route as the landing path redirected to itself forever, and a path no route declares landed on a 404 — including the default, in a project that renamed or removed its Dashboard. `AddPoyo` now validates it against the registry with the other registry checks (`LandingPath.Validate`): when the registry has a guest route, the landing path must be an absolute URL (leaving the application, not checked) or an app path (`/x` or `~/x`) naming a registry route whose access is not `guest`. Anything else fails the boot with a message naming the setting and the reason. A registry without guest routes never redirects there and boots whatever the value. The default stays `/Dashboard` for compatibility; the template's registry declares it.

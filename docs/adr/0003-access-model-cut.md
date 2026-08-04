# Access model cut: single `access` field, strict rejection, no shim

The routes registry historically carried two boolean flags — `isPublic` and `isGuestOnly` — that overlapped: a route could be marked neither, one, or both, with each combination implying different access rules, and the server translated them into controller actions (`PageController.Index` vs. `GuestIndex`) rather than into policy. This forced per-action knowledge of access into the routing layer and made the template's auth behavior implicit and hard to reason about. We cut to a single enum field — `access`, one of `public` | `guest` | `protected`, default `protected` — enforced on every read and write.

## Considered Options

- **Keep two boolean flags, normalize combinations** — Rejected: the combination matrix (`isPublic=false, isGuestOnly=false` vs. other states) is error-prone; a single enum cannot express an invalid state.
- **Single `access` field, migrate legacy flags on read** — Rejected: silent migration hides drift and keeps both shapes valid in the wild; the registry is small, template-owned, and versionless, so a hard cut costs nothing.
- **Single `access` field, reject legacy fields strictly** — Accepted: legacy `isPublic`/`isGuestOnly` are unknown fields and fail loudly in both the CLI (on read/write) and `RoutePolicy` (startup), with no migration shim and no version marker.

## Consequences

- One field, three values, no invalid combinations: `public` (anyone), `guest` (logged out only; authenticated users are redirected away — implies public), `protected` (requires authentication, the default).
- The CLI's `--public`/`--guest` flags map onto the field; `route update` sets or clears it.
- Any hand-edited registry carrying legacy flags is rejected loudly — no silent upgrade path, which is intentional for a starter framework whose registries are small.
- The server's `RoutePolicy` reads `access` and translates it into access policy, not into which controller action runs (see ADR 0004).

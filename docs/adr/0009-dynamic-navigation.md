# Dynamic navigation: explicit-only client navigation with Next.js-parity traversal

**Status**: accepted. Decided with the maintainer in a grilling session (2026-09-23); the capability's glossary name is **Dynamic navigation** — Pwo's own name was left provisional (its ADR recorded a near-tie between "hybrid/client/soft navigation"), and Poyo does not inherit that indecision.

Every route transition in Poyo is a full document load, which discards the React shell: providers, the react-query cache, and any long-lived client session die on navigation. We add **dynamic navigation**: `useRouter()` for programmatic navigation and `<Link>` for declarative links swap the active page component below the shell while the document stays loaded. Unlike Pwo's implementation — the reference for this feature — Poyo ships **no global interception**: there is no Navigation API `event.intercept`, no document-level click listener, no eligibility net over arbitrary anchors. The only navigation drivers are the explicit API and `Link`'s own click handler.

**Decisions**:

1. **Explicit-only drivers** (maintainer decision): `router.push/replace` and `<Link>` share one navigation path; nothing else navigates without a document load. A plain `<a>` in app code is a document load, by design — the boundary is visible in the code that invokes it.
2. **Traversal is Next.js parity** (maintainer decision): if the current URL was reached by `push`/`replace`, browser Back/Forward fetch a descriptor and swap the page (`popstate` path only); otherwise traversal is the ordinary document load. With traversal, scroll restoration comes too: history entries store their scroll position (the `pwo-hybrid` state pattern), restored on the way back.
3. **The wire contract is access-enforced from day one.** A descriptor request (`X-Poyo-Navigation: 1`) is answered by `PageResult` with `{ name, seo, pageData }` as JSON and `Vary: X-Poyo-Navigation`; `RouteAccessFilter` runs before the result executes, so a `protected` route's descriptor challenges anonymous callers — a 401/redirect, never a leaked payload. Pwo deferred server-side enforcement with its descriptor already shipping; Poyo closes that gap at birth.
4. **The registry gains `"dynamic": false`** (per-route opt-out, default `true`), validated at boot by `RoutePolicy` and by the CLI on every read. The name follows the glossary, not Pwo's `"hybrid"`. The server honors it (`PageResult` answers the document when opted out) — it is a server-side enforcement point, not a client convention.
5. **The registry does NOT gain `head` additions.** Poyo's client is a single Vite bundle — every page's CSS ships in the one entry stylesheet — so per-route head additions have no consumer. The field is additive later without breaking the wire contract. (Pwo needs it for page-scoped CSS in consuming apps; Poyo has no consuming-app model.)
6. **Popstate guards from review**: a hash-only change never enters the machinery (the browser owns anchor scrolling), and a last-write-wins token drops superseded traversals.
7. **Fallback floor unchanged**: any failure — non-2xx, non-descriptor body, unknown page name, apply error — ends in a document load for the same URL. The worst case is today's behavior.

**API surface** (deliberate divergence from Pwo, following Next.js's split):

```ts
import { Link } from "@rubichandrap/poyo/runtime/link";       // declarative — next/link
import { useRouter, createRouter } from "@rubichandrap/poyo/runtime/router"; // programmatic — next/router
```

One import site per concept, named after the thing it exports. The runtime root re-exports both.

**Considered options**:

- **Pwo-parity global interception** (Navigation API + document-level click eligibility): rejected — the maintainer wants no interception; the machinery it deletes is the largest, riskiest part of Pwo's runtime (guarded clicks, interception loops, traversal bookkeeping in two paths), and its benefit — hijacking plain anchors — is exactly the behavior explicit-only wants to make visible.
- **Document-load traversal** (no popstate handling): rejected by the maintainer — Back after a `push` must not reload the document; Next.js-parity traversal is the expected feel.
- **Full head-additions port**: rejected for v1 — no consumer in Poyo's single-bundle model; additive later.

**Consequences**: the runtime grows the navigation core (descriptor fetch, parse, route-table lookup, store commit, history writes, scroll restore) with exactly two drivers — roughly half of Pwo's surface; the store/`usePage` contract carries over (the store is what `usePage` reads; `window.SERVER_DATA` seeds it on first load only); `PageResult`, the descriptor-shaped `PageController`, `PoyoPage()`, `AddPoyo()` and `MapPoyoRoutes()` arrive with ADR 0008's bundled server core; `useRouter().route` becomes the shell's reactive source of the current route (amending ADR 0005's "no router integration" posture — the resolver stays per-load, it gains subscribers); the CLI registry validator learns one field (`dynamic`); the fixture e2e gains the descriptor seam (JSON body, `Vary` header, opt-out answering the document, protected route challenging without auth).

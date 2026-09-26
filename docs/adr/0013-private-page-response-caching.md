# Private page response caching

**Status**: Accepted

Poyo page responses can contain controller-authored Page data, including user-specific values. The framework therefore applies `Cache-Control: private, no-store` to all Poyo-owned page, descriptor, access, and page-error responses; retains `Vary: X-Poyo-Navigation`; and states the same-origin descriptor credential mode explicitly. The policy stays internal to the framework-owned page-result and access-filter seams.

The template's cookie-mutating authentication actions get the policy from the project's own `PrivateNoStoreResponseAttribute` — an internal `IResourceFilter` that sets the header through `IHeaderDictionary.CacheControl` and clears `Pragma`/`Expires`, applied at class level on `AuthController`. The attribute belongs to the template project, not the framework package: `poyo-template` copies it into every generated project, so a replacement authentication controller in that same project can apply `[PrivateNoStoreResponse]` directly, and one in a different project applies the equivalent policy from its own source. Poyo's server core exports no cache-policy API. The template's attribute is a second, independent implementation of the same directive string, and the two are kept in step by the server test suite asserting the exact policy on every covered path.

## Considered Options

- Descriptor-only no-store was rejected because HTML documents embed the same Page data.
- Public caching by route access was rejected because `public` access does not prove that controller data is public.
- A global no-store middleware was rejected because it would unexpectedly disable caching for unrelated APIs and would expose a transport policy as a global framework responsibility.
- Legacy `Pragma` and `Expires` headers were rejected because `Cache-Control: private, no-store` is the intended modern contract.

## Consequences

Poyo gives up browser and intermediary HTTP-cache performance for page responses in favor of privacy and predictable authentication behavior. Full-document fallbacks may refetch. Custom cookie-auth controllers must apply the same policy to their own login, refresh, and logout responses, but Poyo does not add a public cache-policy API.

The cost is wider than "fallbacks may refetch." A main document carrying `Cache-Control: no-store` is ineligible for the browser's back/forward cache, so **every** cross-document traversal — the initial entry, a `dynamic: false` route, a `location.assign` fallback, a return from an external site — refetches, re-parses, and re-hydrates instead of restoring instantly. Because the router already sets `history.scrollRestoration = "manual"`, those returns also lose their scroll position. Client-driven traversals are unaffected: the router refetches the descriptor on every traversal by design and never consulted the HTTP cache. Cold-entry scroll behavior is tracked separately as R06.

Narrowing the policy needs a key the server can evaluate soundly, and none of the available ones is one. Route access cannot prove that controller data is public. Absent Page data does not prove a document is anonymous, because a Razor view may render `User` directly. `dynamic` says nothing about personalization. Request authentication state fails too: a `public` route still serves authenticated users, and an anonymous response can still carry per-session values a view chose to render. Closing the space therefore requires a way for a project to declare a response non-personalized, which is a new public API this decision does not add, and which still could not be verified against view-authored personalization. Revisiting this means adding that declaration first.

`Vary: X-Poyo-Navigation` is set by the page result, which never runs for an access challenge or a guest redirect — those 3xx responses carry the cache policy but no `Vary`. This is pre-existing, has no privacy consequence while `no-store` forbids storage outright, and is a documentation defect rather than a gap in the privacy control.

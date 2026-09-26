# Private page response caching

**Status**: Accepted

Poyo page responses can contain controller-authored Page data, including user-specific values. The framework therefore applies `Cache-Control: private, no-store` to all Poyo-owned page, descriptor, access, and page-error responses; retains `Vary: X-Poyo-Navigation`; and uses explicit same-origin credentials for descriptor requests. The policy stays internal to the framework-owned page-result and access-filter seams, while replacement authentication controllers use ASP.NET Core's standard typed response-header interface for their own cookie-mutating endpoints.

## Considered Options

- Descriptor-only no-store was rejected because HTML documents embed the same Page data.
- Public caching by route access was rejected because `public` access does not prove that controller data is public.
- A global no-store middleware was rejected because it would unexpectedly disable caching for unrelated APIs and would expose a transport policy as a global framework responsibility.
- Legacy `Pragma` and `Expires` headers were rejected because `Cache-Control: private, no-store` is the intended modern contract.

## Consequences

Poyo gives up browser and intermediary HTTP-cache performance for page responses in favor of privacy and predictable authentication behavior. Full-document fallbacks may refetch. Custom cookie-auth controllers must apply the same policy to their own login, refresh, and logout responses, but Poyo does not add a public cache-policy API.

# R01 — Private Page Response Caching

## Problem Statement

Poyo page responses can contain user-specific Page data, but their HTTP responses do not declare a privacy-safe cache policy. A shared intermediary could store a document or navigation descriptor containing one user’s data and serve it to another user. The current `Vary: X-Poyo-Navigation` header distinguishes the document representation from the descriptor representation, but it does not distinguish users and does not prevent shared caching.

Dynamic navigation also uses the current HTTP-only authentication cookie. The descriptor transport must explicitly remain same-origin so that authentication cookies are sent for Poyo pages without risking credential delivery to another origin. Cookie-mutating authentication responses must also avoid being cached.

## Solution

Make privacy the default for every Poyo-owned page response. HTML documents, navigation descriptors, access challenges, guest redirects, page errors, and the template’s cookie-mutating authentication responses will emit `Cache-Control: private, no-store`. The existing `Vary: X-Poyo-Navigation` contract remains because the navigation request header still distinguishes the two response representations.

The no-store policy remains internal to the framework-owned page result and access-filter seams. Replacement authentication controllers use ASP.NET Core’s standard typed response-header interface and own the policy for their own cookie-mutating endpoints; Poyo does not add a public cache-policy API or apply a blanket policy to unrelated APIs. Dynamic descriptor requests explicitly use same-origin credentials.

## User Stories

1. As a Poyo application user, I want my Page data not to be stored in a shared HTTP cache, so that another user cannot receive my information.
2. As a Poyo application user, I want dynamic navigation to use my existing authentication session, so that protected pages behave like ordinary authenticated pages.
3. As a Poyo application user, I want a failed or expired session to fall back to normal document authentication, so that I am not shown a mismatched page at the wrong URL.
4. As a Poyo application user, I want the browser to receive `Set-Cookie` normally during login and refresh, so that HTTP-only authentication continues to work.
5. As a Poyo application user, I want browser Back/Forward behavior to remain correct, so that a cache policy does not change the page history contract.
6. As a Poyo application user, I want page metadata and Page data to remain associated with the correct representation, so that dynamic navigation does not expose stale content.
7. As a Poyo application developer, I want all Poyo-owned page responses to have a predictable cache policy, so that I do not need to remember a hidden security rule.
8. As a Poyo application developer, I want custom authentication controllers to use standard ASP.NET Core response headers, so that replacing the demo authentication implementation does not require a Poyo-specific API.
9. As a Poyo application developer, I want unrelated API responses to remain outside the blanket page policy, so that the framework does not unexpectedly disable API caching.
10. As a Poyo application developer, I want explicit same-origin descriptor credentials, so that cookie behavior is visible and testable.
11. As a security reviewer, I want shared caches prevented from storing personalized descriptors, so that access control cannot be bypassed by cache behavior.
12. As a security reviewer, I want shared caches prevented from storing personalized HTML documents, so that the initial document path has the same privacy guarantee as dynamic navigation.
13. As a security reviewer, I want the policy applied to error responses, so that a 404 or authentication challenge is not an accidental cache escape hatch.
14. As a security reviewer, I want the existing `Vary` contract retained, so that the request-header representation distinction remains visible to intermediaries.
15. As a security reviewer, I want no legacy cache headers added, so that the response contract remains small and unambiguous.
16. As an operator, I want `Cache-Control: private, no-store` on Poyo page responses, so that reverse proxies and CDNs do not retain user data.
17. As an operator, I want authentication responses to be non-cacheable, so that login, refresh, and logout do not create stale session state.
18. As an operator, I want an empty or missing Page data payload to not change the privacy default, so that safety does not depend on payload classification.
19. As a release maintainer, I want the cache policy covered by external behavior tests, so that the security contract is verified without coupling tests to helper implementation.
20. As a release maintainer, I want the existing `Vary` contract tested alongside the new policy, so that the wire contract is not accidentally removed.
21. As a release maintainer, I want the policy applied before a response body is written, so that early descriptor and error paths cannot miss the header.
22. As a framework maintainer, I want no new public cache-policy interface, so that the framework API remains small and focused.
23. As a framework maintainer, I want the policy centralized at ownership seams, so that page and access behavior cannot drift between implementations.
24. As a framework maintainer, I want custom authentication ownership to remain explicit, so that replacement authentication is not coupled to Page result internals.
25. As a framework maintainer, I want `Set-Cookie` processing to remain independent from `Cache-Control`, so that the security policy does not interfere with authentication.
26. As a framework maintainer, I want unrelated API responses to remain outside the blanket policy, so that the framework does not become a global response-cache manager.
27. As a framework maintainer, I want same-origin descriptor transport documented, so that cookie behavior is part of the navigation contract.
28. As a framework maintainer, I want a stable response-header contract for the next release, so that applications can reason about caching without implementation details.

## Implementation Decisions

- The Server core owns the no-store policy for all Poyo-owned page responses, including HTML documents, navigation descriptors, page errors, access challenges, and guest redirects.
- The policy is enforced internally at the page-result and access-filter ownership seams. It is not exposed as a new public Poyo cache-policy API.
- Poyo sets the policy unconditionally on Poyo-owned responses, replacing conflicting application cache directives rather than preserving them.
- The exact response directive is `Cache-Control: private, no-store`.
- Poyo does not add `Pragma: no-cache` or `Expires: 0` compatibility headers.
- Poyo retains `Vary: X-Poyo-Navigation`; the request header remains the representation selector and the response header remains cache metadata.
- The template’s cookie-mutating login, refresh, and logout actions apply the same no-store policy through a project-owned `PrivateNoStoreResponseAttribute` — an internal `IResourceFilter` that sets `IHeaderDictionary.CacheControl` and clears `Pragma`/`Expires`, applied at class level on `AuthController`. The original wording here (“ASP.NET Core’s standard typed response-header interface”) stated an intent the implementation superseded; ADR 0013 records the shipped mechanism.
- Dynamic descriptor requests state `credentials: "same-origin"` explicitly. That is already the `fetch` default, so the change is declarative pinning, not a behavior change; the runtime tests assert the option literal, not credential transmission.
- Custom authentication controllers own the cache policy for their own cookie-mutating endpoints; they are not forced through a public Poyo API.
- The no-store policy does not apply blanket-wide to unrelated API responses.
- Dynamic descriptor requests use explicit same-origin credentials. They do not use cross-origin credential inclusion.
- The no-store policy must not prevent the browser from processing `Set-Cookie` or otherwise alter HTTP-only cookie authentication.
- Privacy takes priority over browser and intermediary HTTP-cache performance. A full-document fallback may refetch rather than reuse an HTTP-cached document.
- The existing dynamic-navigation fallback floor remains intact; this work does not change the response representation or page-navigation contract.

## Testing Decisions

- Tests assert externally observable HTTP behavior, not the implementation of a cache helper.
- The highest server seam is the existing HTTP integration harness with a real test host and HTTP client. It covers both document and navigation-descriptor requests, response status, response headers, and response bodies.
- Server tests assert that normal documents and descriptors contain the exact no-store policy and retain `Vary: X-Poyo-Navigation`.
- Server tests assert the policy on descriptor 404s, access challenges, guest redirects, and other Poyo-owned page error responses.
- Authentication integration tests assert that login, refresh, and logout responses are non-cacheable while their authentication behavior, including `Set-Cookie`, remains intact.
- Runtime tests assert that descriptor requests explicitly use same-origin credentials and do not include credentials for another origin.
- Runtime tests assert that no-store behavior does not interfere with successful same-origin descriptor parsing, route commit, or Page data access.
- Tests assert that unrelated API responses are not assigned the blanket page policy unless the application explicitly owns that response.
- Tests assert that legacy cache headers are not added.
- Existing descriptor, access-policy, server integration, navigation, and authentication test patterns are the prior art for these cases.
- A real shared-cache or proxy deployment is not required for acceptance; the stable contract is the exact response policy and credential behavior at the HTTP seam.

## Out of Scope

- Public CDN, reverse-proxy, or browser caching for Poyo page responses.
- A public opt-in cache policy or cache-key design.
- A global no-store policy for every API response.
- A Poyo-specific public cache-policy helper.
- Legacy `Pragma` or `Expires` response headers.
- Replacing the demo authentication implementation or changing the authentication mechanism.
- Cross-origin dynamic descriptor navigation.
- SEO precedence, dynamic metadata, or the `@section Head` proposal.
- Redirect-mismatch handling beyond ensuring the descriptor transport is same-origin; the full redirect fallback contract belongs to R02.
- Route validation, history semantics, scroll restoration, and other release-readiness candidates.

## Further Notes

The accepted decision is recorded in ADR 0013. The cross-candidate release grill map remains the prioritization index. The canonical R01 planning artifact is this directory: `.scratch/r01-private-page-response-caching/`. The relevant existing contract is the descriptor representation and `Vary` behavior recorded in ADR 0009. `Vary` is retained for compatibility, but it is not the privacy control; `Cache-Control: private, no-store` is.

`Cache-Control` controls HTTP response caching, not browser cookie storage. The browser must continue to process authentication cookies normally. The no-store policy should be applied before the response starts so that descriptor, redirect, and error paths are covered consistently.

This spec covers R01 only. R02 owns the complete behavior for redirected descriptors, including deciding whether a redirect is rejected and which document-navigation fallback is used.

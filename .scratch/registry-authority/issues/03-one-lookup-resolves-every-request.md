# 03: One lookup resolves every request

**What to build:** Every server seam that answers "which route serves this request" asks the
same question of the same lookup, by path. Today they disagree: the access filter resolves
by path *or* controller/action, while the page controller and the controller extension both
resolve by path only.

The divergence is a live privacy hole, not a cosmetic issue. A custom controller's page
reached by its conventional URL is access-enforced, but cannot answer a navigation
descriptor and does not receive the private no-store policy — invisible, because the
response looks like a normal access decision. Verified by probe: anonymous `/Page/Index`
returns 500 (view path and route both null, so view resolution fails) and authenticated
`/Page/Index` redirects to the landing path, a wrong guest-redirect for a path the registry
does not own.

The controller/action lookup exists only to resolve a conventional URL backwards into the
registry. With the conventional fallback route removed it has no legitimate caller, so it
goes — along with the access-priority ordering and its list-order tie-break.

An existing integration test must be **deleted, not inverted**: it asserts a conventional URL
is access-enforced, but exercises the *defaulted* page controller while naming itself for a
registry controller, and asserts only the half that works. It is part of what made the seam
look supported. Leaving a passing test under a misleading name preserves the confusion.

Removing the fallback route has no error-handling dependency: the exception handler writes
its response directly, there is no status-code-pages middleware, and no shared error view.
API controllers are attribute-routed and unaffected.

**Blocked by:** None (can start immediately).

**Status:** done

**Completion:** Done. GitHub issues #76-#81 and #85 are closed. ADRs 0014-0018 record the final contracts, including relative registry overrides.

- [x] The conventional controller/action URL for a page route is no longer served, and the conventional URL of the defaulted page controller is no longer served — both return 404 in both auth states.
- [x] Every server seam that resolves a route for a request does so by path through one lookup: the access filter, the SEO filter, the page controller, and the controller extension.
- [x] The controller/action lookup and its access-priority ordering are removed, along with the list-order tie-break between routes sharing a defaulted controller.
- [x] A custom controller's page is reachable only at its declared registry path, so the registry remains the single source of truth for route existence.
- [x] Every URL that reaches a page carries the private no-store policy, including a custom controller's page — closing the conventional-URL privacy hole.
- [x] Every URL that reaches a page answers a navigation descriptor request, including a custom controller's page.
- [x] A protected route's declared path still challenges an anonymous request, so removing the fallback route does not weaken access enforcement.
- [x] The existing conventional-alias integration test is deleted, not inverted, and no test remains that describes the removed behaviour as supported.
- [x] The conventional fallback route is removed from the pipeline, and the comment claiming it provides a clean 404 for unmatched URLs is removed with it — that claim was false.
- [x] Error handling is unaffected: unhandled exceptions still produce their own response, and API controllers still route.
- [x] The changelog and migration notes record the removal, so an operator with a link to the conventional URL knows it now 404s.

Published as #79.

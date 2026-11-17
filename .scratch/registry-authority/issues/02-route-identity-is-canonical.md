# 02: A route's identity is canonical

**What to build:** Strict at rest, liberal at runtime. A route's identity is one thing,
defined once: the authored file is held to a canonical form, and the incoming request is
normalized rather than rejected, because a request URL is not a declaration. A registry
with a non-canonical path, a blank name, a duplicate name, a slash in a name, or a
controller without an action fails the boot naming the offending route and value. A request
in a different case or with a trailing slash still serves the canonical route, in both
anonymous and authenticated states, with the same status, page name, and privacy headers.

Duplicate names are the sharpest case: the client route table holds the same name in three
structures under two tie-break rules, so the same declared name can resolve to a different
page depending on the case of the string used to ask for it. Failing duplicate names at
boot closes that.

Why strict on disk rather than normalizing in memory: three runtimes read the registry and
each carries its own normalizer today, so strict-on-disk replaces three normalizers with
zero. One commonly-asserted reason does not hold — a non-canonical path does not break
hydration, because the client resolves the initial page from the server-declared page name
by name.

The route policy keeps its ordered list alongside new case-insensitive indexes; declaration
order is what error messages and endpoint registration depend on. The framework package's
CLI enforces the same rules, so an invalid registry is rejected when it is authored rather
than when it is deployed.

**Blocked by:** None (can start immediately).

**Status:** done

**Completion:** Done. GitHub issues #76-#81 and #85 are closed. ADRs 0014-0018 record the final contracts, including relative registry overrides.

- [x] A declared path that does not begin with a slash fails the boot.
- [x] A declared path with a trailing slash fails the boot, except for the root path, and the message names the route, the offending path, and the canonical form to use instead.
- [x] Two declared paths differing only by case fail the boot.
- [x] Two declared paths differing only by a trailing slash fail the boot — the collision the current raw-string check misses.
- [x] A blank or missing name fails the boot.
- [x] A name containing a leading or trailing slash fails the boot.
- [x] Two routes with the same name, ignoring case, fail the boot.
- [x] A controller declared without an action fails the boot, and an action declared without a controller fails the boot.
- [x] A route declaring neither a controller nor an action is accepted.
- [x] Every one of these is a startup failure. None is a warning.
- [x] A request for a declared route in a different case and with a trailing slash is served, in both auth states, with the same status, page name, and privacy headers as the canonical request.
- [x] The route policy retains its ordered list alongside the new case-insensitive indexes.
- [x] Each invalid identity is boot-tested, not only unit-tested, and each failure message names the offending route.
- [x] The framework package's CLI rejects each identity the server rejects.
- [x] The generated route manifest emits a canonical path, so a declared path never becomes a trailing-slash URL in the typed path union or in rendered link markup.
- [x] The changelog records the new registry contract.

Published as #78.

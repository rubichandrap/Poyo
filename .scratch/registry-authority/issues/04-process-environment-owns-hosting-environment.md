# 04: The process environment owns the hosting environment

**What to build:** A real deployment variable always wins; `.env` is a development
convenience that fills gaps without overriding, read only when the process says development
or says nothing. Today the template loads `.env` before the builder exists with a loader
that defaults to clobbering, so a deployment that sets its environment correctly still
boots as development — developer exception pages, Vite development integration, no HTTPS
redirection.

The circularity is broken by reading the hosting environment from the process *before*
anything else loads, so the file can never decide the environment it is conditional on.
Development tooling then supplies that environment for a run-from-source launch, and the
example file no longer sets it. The loader's default is to override, so fill-gaps must be
explicit at the call site, not inherited.

The development-only Vite requirements move behind the development check; production then
requires nothing the template owns, since the allowed-hosts value already ships in the base
configuration file. An unset hosting environment falls back to production — the framework's
own default, and the safe direction. Loud failure stays where no safe default exists: the
development variables. Nothing environment-bearing is copied into publish output.

Ownership: the artifact ships safe defaults, the development machine owns `.env`, the
build host owns the client's production values, the deploy host owns the server's.

**Must not ship before ticket 01.** An operator whose production `.env` supplies the
registry path relies on the clobbering to make it authoritative. Once the file stops being
read, those values revert — at exactly the moment the host is set correctly and the
operator believes the deployment is tightened. With the registry authority landed, that
same reversion is a loud startup failure instead of a silent one.

**Blocked by:** 01 — The Routes registry is a required deployment artifact (#77).

**Status:** done

**Completion:** Done. GitHub issues #76-#81 and #85 are closed. ADRs 0014-0018 record the final contracts, including relative registry overrides.

- [x] A real process variable survives a conflicting value in a development `.env` — the mirror of the check that established the current overriding behaviour.
- [x] The hosting environment is read from the process before `.env` is considered, so the file cannot decide the environment it is conditional on.
- [x] `.env` is read only when the process's hosting environment is unset or is development, and is loaded so it fills gaps without overriding an existing value. The fill-gaps behaviour is explicit at the call site.
- [x] A development `.env` that sets the hosting environment is ignored — the process wins, and a typo in the file cannot redirect it.
- [x] Run-from-source development works on a fresh clone with no `.env` present, because development tooling supplies the hosting environment.
- [x] `.env.example` no longer sets the hosting environment, and says where it comes from instead.
- [x] A production host needs no Vite variables: the port-integrality gate and the Vite variable requirements no longer run outside development.
- [x] A missing development variable still fails loudly and clearly.
- [x] An unset hosting environment boots as production rather than failing.
- [x] A production boot with a stray `.env` present still honors its real environment — developer exception pages, the Vite development integration, and the absence of HTTPS redirection cannot be enabled by accident.
- [x] The published output contains no `.env`, asserted by the fixture end-to-end test.
- [x] The changelog carries the operator migration step and explains that a value an operator added to their own `.env` reverts when the file stops being read.

Published as #80.

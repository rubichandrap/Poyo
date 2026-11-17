# Spec — R03, R04, R08: Registry authority and environment ownership

Status: Done. GitHub issues #76-#81 and #85 are closed. ADRs 0014-0018 record the final contracts, including relative registry overrides.

Source: `.scratch/stable-0.5.0-release-readiness/grill-map.md` (candidates R03, R04, R08).
Decisions recorded by grilling on 2026-09-27. All three are decided; none is open.

The grill map stays in its own directory as the record of the grilling process. This
directory holds the implementation spec derived from those decisions.

## Problem Statement

A Poyo deployment has two pieces of configuration that decide who can see what: the
process environment, and the Routes registry. Today neither one is owned by anything.

The Routes registry is resolved from a directory computed as the *parent of the process
working directory* — a value that means something different in every deployment shape.
`dotnet publish` does not emit the registry, so a published application boots into an
empty route policy without a warning. An empty route policy is not a degraded mode: the
access model, the SEO policy, and the private no-store guarantee are all gated on the
registry answering for the request, so a single missing file switches all three off at
once and a protected page becomes reachable. The working directory is also read through a
null-forgiving operator on a call that returns null at a filesystem root, so one legal
working directory throws before configuration is read at all.

The registry's own identity rules are weaker than the lookups they guard. Duplicate-path
detection compares raw strings while the runtime lookup normalizes, so two declared paths
that the server treats as the same route pass validation and are then served by whichever
happens to be listed first. Duplicate names split the client route table, which holds the
same name in three structures under two different tie-break rules — the same declared
name resolves to a different page depending on the case of the string used to ask for it.
Every other identity violation — a blank name, a trailing slash, a controller with no
action — is tolerated silently.

The process environment is in the opposite condition: it is not owned, it is overridden.
The template loads a `.env` file before the application builder exists, using a loader
that defaults to clobbering variables that are already set. A deployment that sets its
environment correctly still boots as development, with developer exception pages and no
HTTPS redirection. The `.env` file is the *only* source of the hosting environment in
development, so the file both decides the environment and is supposed to be conditional
on the environment — a circularity that has kept the bootstrap in its current shape. And
the development-only Vite requirements are asserted before the builder exists and in
every environment, so a production host with no `.env` fails to boot on a development
requirement.

An operator who upgrades is worse off than one who does not: the values in their `.env`
are authoritative today precisely because the loader clobbers, so the moment `.env` stops
being read in production every value they added by hand reverts — and it reverts at
exactly the moment they set their environment variable correctly and believe the
deployment is now tightened.

## Solution

Configuration has one owner, and the framework states which one.

**The Routes registry is a required deployment artifact and a security control.** It is
resolved from an explicit configuration value, falling back to the application's
installation directory — never the working directory, which in ASP.NET is also the default
content root and therefore the same fragility this change exists to remove. It is copied
into the publish output. If it is missing, empty, unreadable, or unparseable, the
application fails to start with a message that distinguishes which of the four happened.
An empty route policy is never a silent, reachable state.

**A route's identity is one thing, defined once, and enforced at rest.** A declared path
is canonical — rooted, without a trailing slash except for the root, unique regardless of
case. A declared name is non-empty, slash-free, and unique regardless of case. A
controller and an action are declared together or not at all. Every one of these is a
startup failure, and none is a warning: in a container or under a service manager, a
warning is invisible until a user reaches the broken state. The server, the framework
package's CLI, and the client runtime all read the same file, so a rule that is only
normalized in memory on the server would leave the other two disagreeing; canonical-on-
disk means nobody has to normalize anything.

**Requests are matched liberally against a strict file.** Trailing slashes and casing on
an incoming path are resolved rather than rejected, because a request URL is not a
declaration and the browser owns its shape. The asymmetry is deliberate: the file is
authored, the request is not.

**Route identity is resolved in exactly one way.** Every server seam that answers "which
route serves this request" asks the same question of the same lookup. The controller/action
lookup exists only so that a conventional controller URL can be resolved backwards into the
registry; with the conventional fallback route removed it has no legitimate caller, and
keeping it produced a state where such a URL was access-checked but could not answer a
navigation descriptor and did not carry the private no-store guarantee. The access filter
and the page controller now agree, by construction.

**A path the registry does not own gets a clean 404.** The conventional fallback route is
removed, so no URL outside the registry can reach a page action at all.

**The process environment is authoritative; `.env` is a development convenience.** The
hosting environment is read from the process before anything else loads, so the file can
never decide the environment it is conditional on. `.env` is read only when the process
says development or says nothing, and it fills gaps without ever overriding a value that
is already set. Development tooling supplies the environment for `dotnet run`. The
development-only Vite requirements move behind the development check. An unset hosting
environment falls back to production, which is the framework's own default and the safe
direction; loud failure stays where no default exists.

**Ownership, in one line:** the artifact ships safe defaults, the development machine owns
`.env`, the build host owns the client's production values, and the deploy host owns the
server's production values.

## User Stories

### Deployment correctness and the access model

1. As an operator, I want a deployment that is missing its route registry to refuse to start, so that a configuration mistake is a failed deploy rather than a site with no access control.
2. As an operator, I want the failure message to say *which* problem occurred — missing, empty, unreadable, or unparseable — so that I do not have to guess from a stack trace.
3. As an operator, I want an explicitly empty registry treated as a failure, so that "my routes are gone" can never be indistinguishable from "my routes are not loaded."
4. As a site visitor, I want a protected page to stay unreachable when I am not signed in, in every deployment shape, so that the access model is a guarantee rather than a default that configuration can switch off.
5. As a site visitor, I want a page that is personalized for me never to be stored in a shared cache, so that I do not see another visitor's data.
6. As a site visitor, I want a URL that is not in the registry to return a clean 404, so that the site does not answer requests for pages that do not exist.
7. As a site visitor, I want a garbage URL to produce a 404 whether I am signed in or not, so that the response does not depend on my session.
8. As an operator, I want the application to start with the working directory set to the filesystem root, so that a container that runs from `/` is not a special case that crashes.
9. As an operator, I want the registry to resolve the same way from the publish directory, from an arbitrary working directory, and from a service manager, so that I do not have to configure a path per deployment shape.
10. As an operator, I want the registry to travel with the published artifact, so that a deployment is a self-contained directory rather than a directory plus a file someone remembers to copy.
11. As an operator, I want to override the registry location explicitly when I need to, so that a shared or centrally-stored registry is possible.
12. As a security reviewer, I want the SEO policy, the access policy, and the caching policy to be impossible to disable independently, so that one missing file cannot switch off a control that a deployment assumed was on.

### Registry identity

13. As a contributor, I want two routes with paths differing only by case to fail the build, so that I cannot declare a route that silently loses to another.
14. As a contributor, I want two routes with paths differing only by a trailing slash to fail the build, so that the registry cannot contain two entries the server treats as one route.
15. As a contributor, I want a declared path with a trailing slash to be rejected with a message naming the route and suggesting the canonical form, so that I fix it rather than guess at it.
16. As a contributor, I want a blank or missing route name to fail the build, so that every route has an identity the client and the server can both use.
17. As a contributor, I want two routes with the same name to fail the build, so that a navigation request can never resolve to a different page than the one the name refers to.
18. As a contributor, I want a route name containing a slash to be rejected, so that names stay usable as identifiers on both sides.
19. As a contributor, I want a controller declared without an action to fail the build, so that a page can never fall back to a default action I did not choose.
20. As a contributor, I want an action declared without a controller to fail the build, for the same reason.
21. As a contributor, I want the registry to accept a route that declares neither a controller nor an action, so that the common case stays free of ceremony.
22. As a contributor, I want a request for a route in a different case or with a trailing slash to still be served, so that canonical-on-disk does not mean brittle in the browser.
23. As a contributor, I want the framework package's CLI to reject the same invalid registries the server rejects, so that I learn about a bad registry when I create it rather than when I deploy it.
24. As a contributor, I want the error to name the offending route and path, so that a registry with twenty entries is still easy to fix.
25. As a framework consumer, I want the registry's contract to be documented as a contract, so that I know which guarantees I can rely on when I write routes by hand.

### Route resolution

26. As a site visitor, I want a navigation request to a registry page to receive the same page data as the document load, so that dynamic navigation and a fresh load agree.
27. As a site visitor, I want a page reached by any URL to carry the same privacy guarantee, so that no URL is a weaker path to my data.
28. As a contributor, I want one lookup to answer "which route serves this request" for every server seam, so that the access policy and the page renderer can never reach different conclusions.
29. As a contributor, I want the conventional fallback route gone, so that no URL outside the registry can reach a page action.
30. As a contributor, I want a custom controller's route reachable only at its declared path, so that the routes registry remains the single source of truth for route existence.
31. As a contributor, I want the client's navigation to have exactly one URL per route, so that a link in rendered markup and the route the server serves are the same string.
32. As a framework consumer, I want the framework package's own default registry resolution to not depend on the working directory, so that a consumer who does not pass an explicit path is not silently exposed.

### Environment ownership

33. As an operator, I want the hosting environment I set on the process to win over anything in a file, so that setting my environment correctly actually takes effect.
34. As an operator, I want a shipped `.env` file to be ignored in production, so that a file I never edited cannot decide how my application boots.
35. As an operator, I want a production host to need no development variables at all, so that a production boot cannot fail on a development requirement.
36. As an operator, I want an unset hosting environment to boot as production, so that a missing variable is safe rather than fatal.
37. As an operator, I want a missing development variable to still fail loudly, so that a broken development setup is obvious immediately.
38. As a developer, I want `.env` to keep working as my single dev configuration file for both the client and the server, so that my daily workflow does not change.
39. As a developer, I want `dotnet run` to work on a fresh clone without me creating a `.env` first, so that setup is one step, not two.
40. As a developer, I want a value I set in my shell to survive loading `.env`, so that I can override one variable without editing the shared file.
41. As a developer, I want a typo in my `.env` to not silently redirect the hosting environment, so that I find out.
42. As an operator, I want the published artifact to contain no environment-bearing file, so that what I ship is what I reviewed.
43. As an operator, I want the changelog and template documentation to tell me exactly which values to move and where, so that my upgrade is a checklist rather than an investigation.
44. As an operator, I want a value I added to my own `.env` to be findable before I upgrade, so that I do not discover its loss in production.
45. As an operator, I want the documentation to name the mechanisms I can use instead — service manager environment files, container environment files, IIS configuration, or a production appsettings file — so that I have a supported path rather than a prohibition.
46. As a security reviewer, I want developer exception pages to be impossible to enable in production by accident, so that a production error page cannot leak a stack trace.
47. As an operator, I want the development-only Vite integration to be genuinely unreachable in production, so that a development dependency cannot affect a production boot.

### Contributor and maintainer experience

48. As a maintainer, I want the boot-failure tests to be a single table of cases, so that adding a validation rule is a fixture and a row rather than a new test class.
49. As a maintainer, I want a test that previously asserted the now-removed behavior to be deleted rather than left passing under a misleading name, so that the suite never contradicts a decision.
50. As a maintainer, I want a published artifact to be proven to boot, so that a deployment-shaped defect is caught before release rather than by a user.
51. As a maintainer, I want the registry's public contract change to be in the changelog, so that a consumer who called the loader directly learns that it can now throw where it previously returned an empty result.
52. As a maintainer, I want this work split so that the registry authority lands before the environment ownership, so that a deployment's configuration is not withdrawn before the replacement is in place.
53. As a maintainer, I want the three candidates to be independently verifiable, so that progress on one is not reported as progress on another.
54. As a framework consumer, I want to know that the registry is a security control rather than a content file, so that I treat its absence as a deployment failure.

## Implementation Decisions

### Resolution and the registry artifact (R04)

- The registry path resolves in a fixed chain: an explicit configuration value first, with
  a relative value resolved against the content root; then the registry file sitting
  beside the application assembly; then a hard startup failure. The process working
  directory is never consulted.
- The fallback anchor is the application installation directory, not the content root. In
  ASP.NET the content root defaults to the current working directory, which is the exact
  fragility being removed; anchoring to the content root would boot correctly from the
  publish directory and fail from anywhere else unless every host configured an absolute
  path.
- The publish configuration copies the registry into the output, where the installation
  directory anchor finds it. The published copy is build output, not a file anyone edits.
- The four failure states — missing file, empty registry, unreadable file, unparseable
  file — each fail startup and each are distinguishable in the message. Unreadable and
  unparseable already fail distinctly; missing and empty are new.
- The registry is copied from its location beside the server project, so the source of
  truth in a generated project remains the single registry file at the project root.
- The framework package's own default resolution — which currently ends at the working
  directory — is changed to the same anchor. A consumer who passes no explicit path must
  not be silently exposed. This is a public default, so it is a contract change.
- The application bootstrap no longer derives a directory from the working directory at
  all, which removes the null-forgiving dereference that threw at a filesystem root.
- The development-time environment file location is repointed as part of this work so that
  changing the directory derivation cannot break the development loop on its own. The
  environment-ownership change is sequenced strictly after this one.

### Single route lookup (R04)

- The conventional fallback route — the pattern that maps any unmatched
  controller/action pair to a page action — is removed from the pipeline. Unmatched paths
  are answered by routing with a clean 404, before any framework filter runs.
- One lookup, by request path, answers "which route serves this request" at every seam:
  the access filter, the SEO filter, the page controller, and the controller extension
  that joins a custom controller to the page contract.
- The controller/action lookup and its access-priority ordering are removed. They exist
  only to resolve a conventional URL backwards into the registry; with the fallback route
  gone, no legitimate caller remains. The list-order tie-break between routes that share a
  defaulted controller disappears with them.
- Removing this also closes a privacy hole: a custom controller's page reached by its
  conventional URL was access-checked but could not answer a navigation descriptor and did
  not receive the private no-store policy.
- An existing integration test asserting that a conventional URL is access-enforced is
  deleted. It exercised the defaulted page controller while describing itself as a
  registry controller, and its passing result is part of what made the seam look
  supported.
- Error handling does not depend on the fallback route: the exception handler writes its
  response directly, there is no status-code-pages middleware, and there is no shared error
  view. API controllers are attribute-routed and unaffected.

### Registry identity (R08)

- Identity is defined once and expressed in two places with different disciplines: the
  declared registry is strict, and the incoming request is liberal.
- Declared-path rules: must begin with a slash; must not end with one except for the root
  path; must be unique across the registry ignoring case. A trailing slash is rejected
  with a message naming the route, the offending path, and the canonical form.
- Declared-name rules: must be present and non-empty; must not begin or end with a slash;
  must be unique across the registry ignoring case. Uniqueness of the name is what keeps a
  navigation request and the client's page resolution pointing at the same page, since the
  client currently holds the same name in three structures under two different tie-break
  rules and would otherwise resolve case-dependently.
- Controller/action rules: either both are declared as non-empty values or neither is.
  A lone controller or a lone action is a startup failure, closing the door on the silent
  default to the page controller and its index action.
- All of the above are startup failures. None is a warning.
- At runtime, an incoming request path is normalized — trailing slashes trimmed, the root
  path preserved — and matched case-insensitively. `/settings`, `/Settings`, and
  `/Settings/` all resolve to a declared `/Settings`.
- The route policy keeps its ordered list of routes and adds case-insensitive indexes over
  normalized paths and names. The list is retained because declaration order is what
  error messages and endpoint registration depend on; the indexes are an acceleration and
  a uniqueness assertion, not a replacement.
- The framework package's CLI enforces the same declared-path, name, and controller/action
  rules when it writes the registry, so an invalid registry is rejected at authoring time
  as well as at boot. The CLI already asserts controller/action pairing; the server does
  not, and the two must agree.
- The client's route table is unaffected by the removal, because a canonical registry is
  already in the form the client expects and the client already resolves the initial page
  by the server-declared page name.

### Environment ownership (R03)

- The hosting environment is read from the process before anything else loads.
- The development environment file is read only when the process's hosting environment is
  unset or is development, and it is loaded so that it fills gaps without overriding
  values that are already set. The loader's default is to override, so this must be
  stated explicitly at the call site rather than inherited.
- The load decision reads the process value only, which is what removes the circularity
  that currently forces the file to supply the very environment it is conditional on.
- Development tooling supplies the hosting environment for a run-from-source launch, and
  the example environment file no longer sets it.
- The port-integrality gate and the Vite variable requirements move behind the
  development check. Production requires nothing the template owns; the allowed-hosts
  value already ships in the base configuration file, which the publish output includes.
- An unset hosting environment falls back to production, which is the framework's own
  default and the safe direction. There is no custom failure for a missing environment;
  loud failure remains where no safe default exists, which is the development variables.
- The publish configuration gains no environment-file copy item, and the fixture
  end-to-end test asserts the published output contains none.
- Ownership: the artifact ships safe defaults, the development machine owns the
  environment file, the build host owns the client's production values, and the deploy
  host owns the server's production values.

### Sequencing

- The registry authority lands first, the environment ownership second. Shipping the
  environment change alone widens the exposure: a deployment whose production environment
  file currently supplies the registry path would stop reading that file at exactly the
  moment the host starts setting its environment correctly, and the bypass would reappear
  silently. With the registry authority already landed, the same reversion becomes a
  loud startup failure.
- The two are independently verifiable. The environment work's proof is environment
  precedence; the published-boot proof belongs to the registry work.

### Contract changes requiring a changelog entry

- The registry loader's public contract changes: a missing file and an empty registry now
  fail rather than returning an empty policy. It is public API in the framework package.
- The framework package's default registry resolution no longer follows the working
  directory.
- The conventional controller/action URL for a page route is no longer served. This is a
  user-visible contract removal and belongs in the migration notes, not only the
  changelog.

## Testing Decisions

**What makes a good test here.** Every assertion is external: a startup that throws with a
distinguishable message, or an HTTP response with a status code and headers. No test
reaches into a private field, a dictionary, or a helper's return value to prove an
internal shape. The normalizer is the one exception worth naming — it is a pure function
with a truth table, and a direct table test is cheaper and clearer than driving it through
a boot. Everything identity-related is proved at boot, because "the registry is validated"
is a claim about what happens when the application starts, not about what a function
returns.

**Modules under test.**

- *Boot failure* — the existing startup-failure theory is the workhorse. It is already a
  table of fixture plus expected-message-substring, and both R04's new failure states and
  all of R08's identity rules are additional rows and fixture files rather than a new
  test class. Cases: missing registry, empty registry, unreadable registry, unparseable
  registry, non-root trailing slash, duplicate path ignoring case, duplicate path by
  trailing slash, blank name, duplicate name, name with a slash, controller without
  action, action without controller. Each asserts the failure names the offending route
  and distinguishes itself from the other three registry failure states.
- *Environment precedence* — a boot with a real process variable set and a conflicting
  value in a development environment file, asserting the process value survives. This is
  the mirror of the check that established the current overriding behavior, run in a
  development environment so the file is read at all. Alongside it: a development boot
  missing a required development variable fails clearly, and a production boot with a
  stray environment file present still honors the real environment.
- *Request resolution* — a request to a declared path in a different case and with a
  trailing slash is served, in both anonymous and authenticated states, with the same
  status, page name, and privacy headers as the canonical request. This is the proof that
  liberal-at-runtime costs nothing.
- *Routing* — the conventional controller/action URL and the page controller's conventional
  URL both return 404 in both auth states; a protected route's canonical URL still
  challenges an anonymous request; the conventional-alias test is gone.
- *Publish and boot* — a test in the server test project that publishes the application,
  then boots the published output twice: once from the publish directory and once from an
  unrelated working directory, asserting every registry route serves in both. This is the
  only seam that can prove the deployment claim, and it runs before release.
- *Loader unit tests* — kept to the normalizer's truth table, plus the two existing tests
  that assert the removed behavior inverted and renamed so the suite never contradicts the
  decision. A test that a registry missing entirely fails is not deleted; it is inverted.
- *Framework package* — the CLI rejects each invalid identity the server rejects, and the
  generated manifest emits a canonical path. The manifest matters because a non-canonical
  path on disk would put a trailing-slash URL into a typed path union and into rendered
  link markup.
- *Fixture end-to-end* — extended, at post-publish, to assert the published output contains
  the registry and no environment file, and that the served document carries its route
  data.

**Prior art.** The startup-failure theory is the model for the identity cases and needs no
new shape. The descriptor contract tests are the model for asserting privacy headers and
page name together on a response. The test environment's approach of injecting
configuration through process variables before the host is built is the only way to reach
the bootstrap from a test, and it is the approach the environment-precedence cases
extend. The existing access-policy integration tests are the model for the 404-versus-
challenge assertions.

## Out of Scope

- **The client's production API base.** The client bundles a build-time value for the API
  base and fails when it is absent, so a production bundle built without it cannot fall
  back to its own origin. That is a real defect, it is a build-host concern rather than a
  server one, and it is tracked separately as its own candidate so it is not narrowed by
  a decision about hosting scope.
- **Subpath deployment.** Threading a path base through the bundler, the Razor asset
  URLs, the API client, the cookie paths, the access redirects, and the descriptor fetch
  is a separate candidate that may resolve to root-only hosting.
- **Guest landing-path validation.** The landing path is read from configuration and used
  without validation or a self-reference check. Separate candidate.
- **The SEO contract.** Precedence between the registry, a controller override, and the
  client, and which head tags participate in dynamic navigation. Separate candidate.
- **The workspace bootstrap.** A clean clone cannot run the documented commands without
  building the CLI first. Separate candidate.
- **The scaffolder's name and containment validation.** Separate candidate.
- **The client's own name-resolution tie-break rules.** Once duplicate names fail the
  build, the inconsistency cannot be reached through a valid registry, so harmonizing the
  three structures is a cleanup rather than part of this work.
- **Migrating an operator's existing deployment.** The migration is documented and
  published; performing it on a given operator's host is theirs.

## Further Notes

- The three candidates are decided and mutually consistent: one owner for configuration,
  one owner for the registry, one definition of route identity, one lookup for a request.
  They are recorded together because they share a single line of bootstrap code and because
  shipping them out of order regresses a deployment.
- The most severe item here is not a routing inconvenience. With the registry absent, the
  access model, the SEO policy, and the privacy guarantee that a prior change added are
  all switched off by the same missing file. That is a partial authentication bypass, and
  it is why the registry is treated as a security control rather than a content file.
- Two of the evidence paragraphs in the source map were corrected by executing the
  application rather than reading it, and one correction supplied to a later reviewer was
  itself wrong. The rule that mechanism claims must be executed, not inferred, produced
  the single most valuable finding in this work: a custom controller's page reached by its
  conventional URL was access-checked but silently lost the privacy guarantee. It was
  found by a probe, not by reading, and it would not have been found at all if the
  conventional URL had been assumed supported.
- One client-side claim in the source discussion was wrong and is worth recording so it is
  not repeated: a non-canonical path does **not** break hydration, because the client
  resolves the initial page from the server-declared page name by name, not by path. The
  real argument for a canonical registry is that three runtimes read the file and each
  would otherwise need its own normalizer — strict-on-disk means none of them does.
- A duplicate route name does more than produce an invalid type. The client route table
  holds the same name in three structures under two different tie-break rules, so the same
  declared name can resolve to different pages depending on the case of the string used to
  ask for it. Failing duplicate names at boot closes that.
- Upgrade guidance for operators is part of this work, not a follow-up: the values in a
  hand-edited production environment file are authoritative today precisely because the
  loader overrides, so they revert the moment it stops reading the file. The hazard's
  shape is that reversion coincides with a correctly-configured host, so a green boot is
  not evidence that the migration is complete.

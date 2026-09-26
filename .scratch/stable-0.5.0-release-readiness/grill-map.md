# Stable 0.5.0 Release Readiness Grill Map

Status: decision map, not an implementation plan
Comparison baseline: `v0.4.1` (`1c85643dbd36a70505676bb635aa54ab7bbb3bbc`) to current `HEAD` (`71ae93c`)
Current release: `0.5.0-beta.2`

## Purpose

Use this document to grill each release candidate separately before creating implementation tickets. The audit found possible stable-release blockers; this map records the decision that must be made for each one, the evidence, and a recommended default.

A candidate is not accepted merely because it is interesting. It is accepted only when its contract, ownership, compatibility behavior, and verification proof are explicit.

## Working rules

- Run one grilling session per candidate.
- Separate facts from decisions. The agent gathers facts; the user decides policy and scope.
- Ask the whole current decision frontier in each round, then wait for answers.
- Do not implement a candidate until the decision is recorded here.
- Every accepted P0/P1 candidate must have a focused regression test and an owner.
- Re-run the complete release gate after the accepted decisions are implemented.
- Do not rewrite published Git history for commit-message convention findings.

## Current verification snapshot

Passed during the audit:

- `@rubichandrap/poyo`: 186 tests
- `@rubichandrap/create-poyo-app`: 22 tests
- Server integration tests: 92 tests
- Release-version unit tests: 7 tests
- Root lint
- Client typecheck, lint, and format
- `pnpm run release:check`
- Published `0.5.0-beta.2` npm-backed fixture audit: passed against the published beta

Failed or incomplete:

- `pnpm --filter poyo-template run server:format` fails because the current worktree's `Program.cs` has no final newline.
- The existing suites do not cover the browser, cache, clean-checkout, or production-deployment cases below.
- The current worktree has unrelated changes in `.gitignore`, `Program.cs`, and `.scratch/controller-title-seo-override/`; they must not be overwritten.

## Priority definitions

- P0: security, data integrity, or production boot/release failure. Must be resolved before another release candidate.
- P1: user-visible correctness or a supported contract that is currently broken. Must be resolved before stable `0.5.0` or explicitly removed from the supported contract.
- P2: cleanup or lower-impact inconsistency. May follow stable if documented and not part of the advertised contract.

## Candidate map

### R01 - Personalized descriptor caching

Priority: P0

Decision: B — keep the no-store policy internal to Poyo's `PageResult` and `RouteAccessFilter`; do not add a public Poyo cache-policy API. Custom cookie-auth controllers use ASP.NET Core's standard typed response-header API and are responsible for their own `private, no-store` policy. The framework still guarantees no-store for all Poyo-owned page/access responses, including errors; template login/refresh/logout responses are covered. Keep `Vary: X-Poyo-Navigation`. Emit only `Cache-Control: private, no-store`; do not add legacy `Pragma` or `Expires` headers. Dynamic descriptor fetches use explicit same-origin credentials only. Privacy wins over browser HTTP-cache performance. Acceptance proof is automated behavior tests.

Evidence: `packages/poyo/server/PageResult.cs:148-184` sets `Vary: X-Poyo-Navigation` but does not set a cache policy. Controller-authored `pageData` can contain user-specific values.

Decision to grill: Should all dynamic-navigation descriptors default to `Cache-Control: private, no-store`, or should the framework support an explicit public-cache opt-in?

Recommended default: Default every descriptor containing controller data to private/no-store. Make public caching an explicit, typed opt-in only after a cache-key and authorization design exists.

Acceptance proof: An authenticated descriptor cannot be served to another user by a shared cache; tests assert the response policy for public, guest, protected, and data-bearing routes.

**Post-implementation review (after R02's work uncovered it).** The policy is implemented and tested at the right seams, but the decision shipped with three defects and one unexamined consequence:

- **The published description of the auth seam was wrong.** The spec and ADR both said replacement auth controllers apply the policy through a standard typed response-header interface; what shipped is the project-owned `PrivateNoStoreResponseAttribute` (an internal `IResourceFilter`, applied at class level on `AuthController`). Corrected in ADR 0013, `spec.md`, and `AGENTS.md` §6.1. The attribute's class-level scope is a live hazard for anyone adding a non-cookie-mutating endpoint to that controller, since the framework's own documentation does not mention the mechanism.
- **`Vary: X-Poyo-Navigation` is absent from access challenges and guest redirects**, because the page result never runs on those paths. Pre-existing, not a regression, and with `no-store` forbidding storage outright it has no privacy consequence — a documentation defect, now recorded in ADR 0013's Consequences rather than silently tolerated.
- **The `credentials: "same-origin"` claim overstated a no-op.** It is already the `fetch` default; the change is declarative pinning, and the tests assert the option literal rather than credential transmission. Now stated accurately in `spec.md` and the changelogs.
- **The test suite proved the server half of an interaction whose client half was broken.** `DescriptorContractTests` asserts the cache policy on both redirect paths, which reads as "redirect covered" — but the only meaningful consumer of those 3xx responses is the client router, which was mocked at a seam that could not fail. R01's green is part of why R02's hole survived. Generalisable lesson: testing each half of a client/server interaction in isolation with a mocked seam is how this class of bug ships.
- **The unexamined consequence is the real cost.** `no-store` on a main document makes it ineligible for the browser's back/forward cache, so *every* cross-document traversal refetches and re-hydrates and loses scroll position — not merely "full-document fallbacks" as the spec's blast-radius sentence implied. No sound narrowing key exists (access cannot prove data is public, absent Page data does not prove a document is anonymous because a Razor view may read `User`, and `dynamic` is unrelated to personalization), so the blanket default is kept and the cost is now recorded rather than discovered later. Cold-entry scroll remains R06.

**Test-suite debt found and fixed in the same pass.** `createRouterHarness` modelled `pushState`/`replaceState` as inert mocks, so the router's `{...existingState}` merge and its post-push `lastCommittedUrl` were unreachable: deleting the merge kept all 36 runtime tests green. The harness now performs the browser's synchronous state and address-bar write, and has its own suite (`router-test-helpers.test.ts`) pinning that fidelity — the first version of that fix bound the URL to `pushState`'s *title* argument, so the address-bar write silently never happened and 191 green tests still could not see it. The supersede-token test's `pushState` assertion — which asserted against a `null` state the router never writes, so it could not fail — now asserts the number and targets of every write. `PoyoPage_replaces_application_cache_directives` also passed vacuously for `Pragma`/`Expires`, because no controller ever set them; the test controller now sets all three, so the clearing code is genuinely covered.

### R02 - Redirected descriptor mismatch

Priority: P0

Status: **Resolved** — reject the redirect, degrade to a document load.

Decision: The descriptor request is issued with `redirect: "manual"`. A 3xx therefore arrives as an opaque response (`status` 0, not ok) and lands in the existing `!response.ok` check, which degrades to a document load of the URL that was *requested*; the browser applies the redirect itself, exactly as it would for a plain `<a>` click. On the Back/Forward paths the fallback is replace-equivalent (`location.replace`), because the browser has already moved the current history entry and the document load must settle that entry rather than risk truncating the stack; push-vs-replace for a client-initiated navigation remains R05. A response that reports `redirected === true` is also refused, so an injected transport that follows redirects cannot reintroduce the bug. No server change, no wire-contract change, and **no ADR 0009 amendment** — decision 7 already promised a document load for "the same URL" on any non-2xx, and the code now matches it.

Evidence for rejecting follow-and-commit: (1) a `cors`-mode fetch carrying a non-safelisted header cannot observe a cross-origin redirect at all — the preflight fails and the fetch rejects, so the "follow it to the IdP" case never reaches JavaScript; (2) a `protected` → `/Login` challenge is an *auth-boundary crossing*, and the client cannot render it correctly — `Set-Cookie` is a forbidden response header, so the client is blind to the session-termination cookie, while its `AuthProvider` and `QueryClient` still hold the previous session; (3) a `dynamic: false` redirect target such as `/Register` is server-rendered and transferred in full, then discarded. Follow-and-commit's only surviving benefit is a logged-in user clicking a stale `guest` link, which is too thin to justify a security-adjacent mechanism, and is deferred rather than dropped: the route table's `access` field makes a redirect's auth-boundary direction classifiable for free, so a direction-aware follow is a clean future candidate.

Acceptance proof: a redirect cannot be committed; the request is never made with redirect following; the opaque body is never read; no history entry is written on the redirect path. `navigation.test.ts` covers the opaque response, the reported-redirect response, and the option itself.

### R03 - Configuration ownership and `.env`

Priority: P0

Evidence: `packages/poyo-template/Poyo.Server/Program.cs:6-10` loads `.env` with defaults that can override deployment process variables. `packages/poyo-template/.env.example:4`, `:17`, and `:28` contain development defaults.

Decision to grill: Is Poyo explicitly environment-only, and should `.env` be development-only with non-overriding semantics? Is deleting `appsettings*.json` part of this decision or a separate cleanup?

Recommended default: Keep environment variables as the runtime source of truth. Load `.env` only as a development convenience and never override real process variables. Remove duplicate `appsettings*.json` only after the environment matrix is tested.

Acceptance proof: Development, staging, and production boots prove that deployment variables win, production does not require Vite-only variables, and missing required configuration fails clearly.

### R04 - Registry discovery in published output

Priority: P0

Evidence: `Program.cs:52-54` derives the registry path from the current working directory. `RoutePolicy.Load()` treats a missing file as an empty policy (`packages/poyo/server/RoutePolicy.cs:30-35`). A published output can boot with every registry route missing.

Decision to grill: Should `routes.json` be copied into the publish output, resolved through an explicit deployment setting, or embedded into the server assembly?

Recommended default: Treat the registry as a required deployment artifact. Resolve it from an explicit configuration/content-root path, copy it during publish, and fail startup when it is missing. Do not silently substitute an empty policy in production.

Acceptance proof: A clean `dotnet publish` output runs from its publish directory and from an arbitrary container working directory, serving every registry route.

### R05 - `replace()` fallback semantics

Priority: P1

Evidence: `packages/poyo/src/runtime/router.ts:304-334` uses `location.assign()` for both push and replace failures. A failed replace adds a history entry.

Decision to grill: Must failed `replace()` preserve replacement semantics, or is document navigation allowed to add an entry when the server cannot supply a descriptor?

Recommended default: Preserve the requested history operation. Use replace-equivalent document navigation for failed `replace()` and push-equivalent navigation for failed `push()`.

Acceptance proof: 404, malformed descriptor, opt-out HTML, redirect, and network failures preserve Back/Forward history semantics.

### R06 - Scroll state and restoration

Priority: P1

Evidence: `router.ts:338-366` records zero scroll for a replacement without moving the viewport. `router.ts:430-436` schedules a restoration frame without checking whether a newer navigation superseded it. `router.ts:393-397` reloads cold entries while browser restoration is manual.

Decision to grill: Must scroll restoration work for cold entries, or is a cold entry explicitly a plain document navigation with browser-owned restoration?

Recommended default: Make the behavior coherent: preserve the current entry's scroll before leaving, mark the initial entry when the router owns it, and invalidate queued restoration when a newer navigation wins.

Acceptance proof: Push, replace, Back, Forward, cold-entry Back, rapid navigation, and async restoration tests assert both history state and actual viewport position.

### R07 - Programmatic hash navigation

Priority: P1

Evidence: `router.ts:240` strips the hash for descriptor fetches, but `router.ts:313-367` still enters the navigation machinery for programmatic `push('#id')` and `replace('#id')`.

Decision to grill: Should the programmatic router explicitly support hash-only navigation, or should hash-only changes always remain native browser behavior?

Recommended default: Keep hash-only changes native for both declarative and programmatic navigation. Reject or delegate hash-only router calls before fetching a descriptor.

Acceptance proof: Programmatic and declarative hash navigation do not fetch, swap pages, announce a page change, or reset scroll unexpectedly.

### R08 - Route registry validation

Priority: P1

Evidence: `packages/poyo/server/RoutePolicy.cs:56-66`, `:75-84`, and `:125-145` do not reject empty/duplicate names, normalized duplicate paths, trailing-slash duplicates, or incomplete controller/action pairs.

Decision to grill: Which route identities must be globally unique and canonical, and should malformed identities fail startup or be skipped with a warning?

Recommended default: Fail startup for empty names, duplicate names, duplicate normalized paths, invalid route paths, and incomplete controller/action pairs. The server is the authoritative registry validator.

Acceptance proof: Startup-failure tests cover every invalid identity, and valid case-insensitive lookup remains supported.

### R09 - Guest landing redirects

Priority: P1

Evidence: `packages/poyo/server/RouteAccessFilter.cs:46-49` can redirect to a configured landing path without rejecting self-redirects or preserving `Request.PathBase`.

Decision to grill: Should landing-path configuration be validated at startup, checked per request, or both? What is the supported behavior for a missing or inaccessible landing route?

Recommended default: Validate the landing path at startup, reject self/redirect loops, preserve `PathBase`, and fail clearly if the landing route is not a valid registry route.

Acceptance proof: Default, custom, self-referential, missing, protected, and `PathBase` scenarios have integration coverage.

### R10 - SEO precedence and dynamic metadata

Priority: P1

Evidence: `packages/poyo/server/SeoPolicyFilter.cs:35-38` supplies route defaults, `PageResult.cs:178-181` sends raw registry SEO in descriptors, and `packages/poyo/src/runtime/router.ts:129-145` leaves null titles and descriptions stale. The document layout adds ` - Poyo`, while client navigation assigns the raw descriptor title.

Decision to grill: Is SEO registry-authoritative, controller-overridable, client-overridable, or a typed layered model? Which layer owns the formatted title and which head tags are supported during navigation?

Recommended default: Keep `routes.json` as the static baseline, add an explicit typed per-request SEO override at the `PoyoPage` seam, compute one effective SEO value for document and descriptor, and define client metadata as a deliberate final override. Standardize the title suffix.

Acceptance proof: Document and descriptor tests use the same effective title/description; null SEO has a defined fallback; client navigation updates or clears metadata deterministically; SSR and CSR accessibility announcements agree.

### R11 - View head extension seam

Priority: P2

Evidence: `_Layout.cshtml` currently owns the document head and has no Razor section for page-specific head additions. ADR 0012 intentionally avoids executing views for descriptors.

Decision to grill: Should `@section Head` be an additive SSR-only extension, or should it be part of the dynamic-navigation SEO contract?

Recommended default: Add an additive `@section Head` for trusted SSR-only tags such as canonical and hreflang. Keep title, description, Open Graph, and JSON-LD in the typed SEO contract so they can work during dynamic navigation.

Acceptance proof: SSR view sections render in the head, descriptor requests do not execute Razor sections, and the supported metadata ownership is documented.

### R12 - Workspace clean-build bootstrap

Priority: P1

Evidence: `packages/poyo/package.json:11-13` exposes the CLI through `dist`, which is generated and ignored. A clean archive can install before the CLI binary exists; the current dirty workspace hides this because `dist` exists.

Decision to grill: Should a clean checkout be able to run `pnpm install` followed immediately by the documented template commands, or must contributors build workspace packages first?

Recommended default: Make the documented clean-checkout path work without a pre-existing ignored artifact. Use an explicit bootstrap command or a package-script boundary that builds the CLI before invoking it.

Acceptance proof: A clean archive runs install, the prescribed build/generate commands, and server/client tests without relying on ignored files.

### R13 - Scaffolder project-name validation

Priority: P1

Evidence: `packages/create-poyo-app/src/index.ts:166-190` accepts names without proving that the generated C# namespace and filesystem paths are valid.

Decision to grill: Which project names are supported, and should invalid names be rejected before any files are written?

Recommended default: Accept a deliberately small, documented identifier grammar compatible with C# namespaces and filesystem paths. Validate before scaffolding begins.

Acceptance proof: Invalid names fail before directory creation; every accepted sample scaffolds, installs, typechecks, and builds.

### R14 - TypeScript peer compatibility

Priority: P1

Evidence: The generated client uses TypeScript `6.0.3` while `openapi-typescript@7.13.0` declares a TypeScript 5 peer range. Default installs warn; strict peer installs fail.

Decision to grill: Is TypeScript 6 a required stable-client contract, or may the generated client remain on the latest compatible TypeScript 5 release?

Recommended default: Do not ship a stable template with a known peer conflict. Either use a mutually supported toolchain or explicitly constrain/upgrade the dependency before release.

Acceptance proof: Clean generated-project installation with strict peer enforcement succeeds, and the supported Node/package-manager matrix is documented.

### R15 - Subpath deployment support

Priority: P1

Evidence: `packages/poyo/src/commands/build.ts:91-123` writes root-relative assets and the Vite config uses `base: "/"`. The runtime has partial `VITE_BASE_URL` support, but the full asset/API/redirect path is not covered.

Decision to grill: Is subpath deployment a supported stable feature, or should Poyo explicitly support root deployments only for 0.5.0?

Recommended default: Either complete the path-base contract across Vite assets, Razor, client URLs, API calls, auth redirects, and dynamic navigation, or remove the partial support claim and validate root-only hosting. Do not leave partial support undocumented.

Acceptance proof: The chosen scope has a clean generated project, build, and runtime test matrix.

### R16 - Public `PageResult.For` seam

Priority: P2

Evidence: `packages/poyo/server/PageResult.cs:52-63` exposes a public page-data construction path alongside `ControllerExtensions.PoyoPage()`.

Decision to grill: Is `PageResult.For` a supported public framework API, or an internal compatibility artifact that should be removed before stable?

Recommended default: Keep one public controller seam: `PoyoPage(data)`. Make the lower-level result factory internal unless a concrete external caller requires it.

Acceptance proof: Public API documentation and tests expose only the intended authoring interface.

### R17 - Route manifest refresh on no-op route update

Priority: P2

Evidence: The dynamic-navigation manifest requirement says every route command keeps it fresh, but a no-op `route update` currently emits nothing.

Decision to grill: Must a no-op route update rewrite the manifest, or is freshness defined only after a registry change?

Recommended default: Emit/refresh the manifest through one shared route-command path, including no-op updates, or document and test the narrower invariant.

Acceptance proof: Every route command has a deterministic manifest-freshness test.

## Recommended grilling order

1. R01 descriptor caching
2. R02 redirected descriptors
3. R03 environment ownership
4. R04 published registry discovery
5. R05-R09 navigation and registry correctness
6. R10 SEO contract
7. R11 head sections
8. R12-R15 clean generation, scaffolding, peers, and hosting scope
9. R16-R17 cleanup

Do not begin implementation from this map until the user confirms which candidates are accepted, rejected, or deferred.

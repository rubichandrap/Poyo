# Spec — usePage ships in the framework package's client runtime

ADR: docs/adr/0005-framework-package-owns-client-runtime.md

## Problem Statement

`usePage` is a framework API — the accessor for server-injected page data (`window.SERVER_DATA`) — but it lives in the template as a local hook (`poyo.client/src/hooks/use-page.ts`), copied wholesale into every generated project. Each project carries a private copy of framework code with no upgrade path, and the template's `window.d.ts` types the global as `any`. The accessor belongs to the framework and should ship from the framework package, the way Next.js ships `useRouter` from `next/router` — not from the template.

## Solution

`usePage` moves into `@rubichandrap/poyo` (the existing framework package) as a subpath export `./runtime`. The package owns the global typing (`Window.SERVER_DATA?: unknown`, upgraded from `any`). The template's client declares the framework package as `workspace:*` and the scaffolder rewrites it to the release version at generate time; `src/hooks/` and `src/types/window.d.ts` are deleted from the template, and the Dashboard demo imports from `@rubichandrap/poyo/runtime`. No new package — the release pipeline stays three packages, one version, lockstep. Generated projects resolve the accessor from npm at a real version and can upgrade it independently of the template.

## User Stories

1. As an app developer, I want to import `usePage` from `@rubichandrap/poyo/runtime`, so that I use the framework's accessor instead of a template-local copy.
2. As an app developer, I want `usePage<T>()` to return the server payload typed as `T`, so that my page code is type-safe without manual casting.
3. As an app developer, I want `usePage` to return `null` when there is no usable payload (SSR, missing, null, array, primitive), so that I can handle the empty state explicitly.
4. As an app developer, I want the `window.SERVER_DATA` global typed as `unknown`, so that strict TypeScript forces narrowing instead of unchecked reads.
5. As an app developer, I want to upgrade the accessor by bumping the framework package version, so that framework fixes reach my generated project without waiting for a template release.
6. As an app developer, I want one package to install and learn, so that the framework's surface stays minimal — the analogue of `next`.
7. As a framework user, I want the Dashboard demo to show the canonical package import, so that I learn the intended usage from the skeleton.
8. As a maintainer, I want the template's client to declare the framework package as `workspace:*`, so that workspace dev is always in sync with the source.
9. As a maintainer, I want the scaffolder to rewrite that dependency to the release version at generate time, so that generated projects resolve from npm, not a workspace protocol that fails outside the monorepo.
10. As a maintainer, I want a red-green scaffold test for the rewrite seam, so that a broken seam fails the build instead of shipping broken projects.
11. As a maintainer, I want a fixture e2e that scaffolds a real project, installs from npm, and asserts the package resolves at the release version, so that the release is verified end-to-end.
12. As a maintainer, I want the release pipeline to stay three packages, so that lockstep publishing and the release workflow do not grow.
13. As an existing generated-project owner, I want my project to keep working unchanged, so that this framework change is not breaking for me.
14. As a future framework developer, I want a documented home for client framework APIs (`./runtime`), so that new APIs land in one place instead of the template or the CLI surface.

## Implementation Decisions

- `usePage<T extends object = Record<string, unknown>>(): T | null` lives in `@rubichandrap/poyo` under the subpath export `./runtime`; the main export stays the CLI entry. Future client framework APIs share the `./runtime` subpath.
- The runtime module must stay browser-safe and dependency-free (no Node imports); `react` becomes a peerDependency of the framework package for the hook contract.
- The package owns `declare global { interface Window { SERVER_DATA?: unknown } }`; the template's `src/types/window.d.ts` is deleted. Behavior is unchanged: SSR guard, one-shot non-reactive read, trust-the-producer narrowing (any non-null non-array object returns as `T`).
- The template's `poyo.client` declares `"@rubichandrap/poyo": "workspace:*"` in devDependencies (all client deps are dev deps — the client is Vite-bundled); `src/hooks/use-page.ts`, `src/hooks/index.ts` are deleted; the Dashboard page imports from `@rubichandrap/poyo/runtime`.
- The scaffolder's `rewritePackageJson` gains a client-level seam: rewrite the framework package dependency in `<project>.client/package.json` from `workspace:*` to the scaffolder's own lockstep version, mirroring the existing root-level rewrite; silent-skip when the dependency is absent.
- New fixture e2e script: scaffold a project with the local scaffolder, `pnpm install` (resolves from npm), assert `node_modules/@rubichandrap/poyo` is present at the release version and the built client bundle carries the accessor. Expected red until the version is published (the npm-resolution proof).
- Release mechanics unchanged: still three packages in `assert-release-version.mjs` and `release.yml`; the feature ships as 0.3.0 (additive minor — existing generated projects are standalone copies and unaffected).

## Testing Decisions

- A good test asserts external behavior: the accessor's observable contract (what it returns for a given `window` state), the scaffolder's observable output (what the generated project's client declares), and the generated project's observable resolution (package present at the release version, accessor in the bundle). No internal-unit assertions on the rewrite implementation.
- Modules tested:
  - `packages/poyo` (existing vitest seam): unit tests for `usePage` — no `window` → null; missing/null/array/primitive `SERVER_DATA` → null; plain object → payload; typed generic.
  - `packages/create-poyo-app` (existing `scaffold.test.ts` seam): red-green assertions for the client rewrite — dependency absent → untouched; `workspace:*` → rewritten to the release version.
  - New fixture e2e (new seam, highest point): scaffold → install → build → assert npm resolution + bundled accessor.
- Prior art: `scaffold.test.ts` red-green pattern (existing in this repo), vitest in `packages/poyo` (existing), and the Pwo fixture e2e (`scripts/fixture-e2e.test.mjs` in the Pwo repo) which proved the publish-order pitfall (404 until the package is published).

## Out of Scope

- Server-side changes: the `[ServerData]` attribute, `ViewBag.ServerData`, and the `_Layout.cshtml` injector are untouched.
- `usePageLeave` and `src/hooks` content beyond `usePage`: stays deleted/absent.
- Moving other client infrastructure (HTTP client, TanStack Query setup) into the framework package.
- Migrating existing generated projects: they are standalone copies and are not touched.
- Aligning with Pwo's separate `@pwo/runtime` package: the divergence is deliberate (see ADR 0005).
- Making the channel reactive: the one-shot bootstrap contract is unchanged.

## Further Notes

- The unscoped name `poyo` is unavailable on npm (taken by an unrelated game engine); the single-package model uses the existing `@rubichandrap/poyo` scope.
- The fixture e2e is red until the version is published — this is by design and matches the Pwo experience; it is the release-time proof that generated projects resolve from npm.
- Docs to update in the same change: AGENTS.md §3.3 (server data hook), README package table, CHANGELOG, and the CONTEXT.md glossary (term "Project CLI" → "Framework package", new term "Page data", "Generated project" definition adjusted).

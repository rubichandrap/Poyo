# Archived text from ADR 0011

Superseded by the 0.5.0-beta.4 Amendment. Kept verbatim so the history of the decision stays readable; the current decision is in [`../0011-typescript-6-migration-and-baseurl-modernization.md`](../0011-typescript-6-migration-and-baseurl-modernization.md).

1. **Monorepo-wide lockstep upgrade to TypeScript 6.0**: All three packages (`@rubichandrap/poyo`, `@rubichandrap/create-poyo-app`, and `packages/poyo-template/poyo.client`) are upgraded in lockstep to exact `"typescript": "6.0.3"`, adhering to Poyo's monorepo-wide exact-dependency convention.

---

3. **Configure peer dependency resolution**: Add `pnpm.peerDependencyRules.allowedVersions` in root `package.json` to allow `typescript: "6.0.3"` to satisfy `openapi-typescript`, keeping installs clean in CI and developer workflows without masking unrelated warnings.
4. **Update scaffolder test seams**: Update test fixture manifests in `packages/create-poyo-app/test/scaffold.test.ts` to reflect `6.0.3`.

---

- New generated projects scaffold with clean, warning-free TypeScript 6.0 `tsconfig` configurations compatible with bundler resolution and future TypeScript 7.0 releases.
- Framework CLI, client runtime, scaffolder, and template share identical TypeScript compiler semantics.
- `pnpm install` remains warning-free with explicit peer dependency accommodation.

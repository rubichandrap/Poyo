# 01 — refactor(repo): migrate workspace to pnpm

**What to build:** The repository runs entirely on pnpm instead of npm — pnpm workspace file, pnpm lockfile, and engine settings — with every existing script still working exactly as before. No layout change.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `pnpm-workspace.yaml` at the root lists the same packages npm's `workspaces` does today (`poyo.client`, `Poyo.Server`); `package-lock.json` is replaced by `pnpm-lock.yaml`.
- [x] `.npmrc` keeps `engine-strict=true` and any engine settings port to pnpm.
- [x] `pnpm install` succeeds and every existing root script (`dev`, `build`, `route:*`, `generate`, `restore`) behaves identically to its npm equivalent.
- [x] Client and server still build and run; no functional regression.

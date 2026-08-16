# 03 — Scaffolder rewrites the client dependency to the release version

**What to build:** A generated project declares the framework package at a real npm version instead of workspace:*, so its client resolves the accessor from the registry — never a workspace protocol, which fails outside the monorepo.

**Blocked by:** #25

**Status:** done — PR #29

- [x] rewritePackageJson rewrites the framework package dependency in <project>.client/package.json from workspace:* to the scaffolder's lockstep version
- [x] Dependency absent → left untouched (silent-skip)
- [x] scaffold.test.ts is red-green: dependency absent → untouched; workspace:* → release version
- [x] create-poyo-app tests pass

GitHub: https://github.com/rubichandrap/Poyo/issues/26

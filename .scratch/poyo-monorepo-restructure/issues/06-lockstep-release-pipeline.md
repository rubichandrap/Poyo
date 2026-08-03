# 06 — ci: lockstep release pipeline for the three packages

**What to build:** A maintainer cuts a git tag and all three packages — template, project CLI, scaffolder — are compiled and published to public npm in lockstep, with versions verified to match the tag. The stale GitHub-Packages release workflow is replaced.

**Blocked by:** 04 — build and generate commands; 05 — rewrite create-poyo-app.

**Status:** done

- [x] A GitHub Actions workflow triggered on a git tag runs `pnpm install`, compiles the TypeScript (`tsc`) for `poyo` and `create-poyo-app`, asserts all three `package.json` versions equal the tag, and publishes all three to public npm.
- [x] The stale GitHub-Packages `publish.yml` is removed.
- [x] Cutting a tag produces three installable packages at the same version.

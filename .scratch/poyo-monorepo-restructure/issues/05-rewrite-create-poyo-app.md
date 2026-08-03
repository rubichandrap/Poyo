# 05 — feat(scaffolder): rewrite create-poyo-app against the template package

**What to build:** A developer runs `create-poyo-app MyApp` and gets a clean generated project — the template package copied wholesale, renamed to the project name, with the project CLI pinned as a dev dependency and dependencies installed. The old whole-repo-copy scaffolder is deleted.

**Blocked by:** 03 — route management commands.

**Status:** done

- [x] `packages/create-poyo-app` is a TypeScript CLI (`bin: create-poyo-app`) accepting a positional project name or `--project`.
- [x] It copies the template package directory wholesale (excluding `node_modules`), renames `Poyo`→project name across files, and rewrites the copied `package.json` with the project name, a fresh version, and `@rubichandrap/poyo` pinned to a concrete published version (the `workspace:*` reference replaced).
- [x] It runs `pnpm install` in the generated project; a `--skip-install` flag skips the network step.
- [x] The template resolves from the local workspace during monorepo development and from the registry in its published form.
- [x] `cli/create-poyo-app.js` is deleted.
- [x] Tests: `create-poyo-app <dir> --skip-install` in a temp dir asserts the generated tree and rewritten `package.json`.

# Route tooling in TypeScript/Node, not Go

The route CLI was rewritten in Go (commit `af597bf`, "nodejs too slow on the cold start") and cross-compiled to four platform binaries in `tools/poyo/bin/`, wrapped by the `poyo` and `poyo.ps1` scripts. This left the repo in a hybrid state: `package.json` route scripts still called the Node `scripts/manage-routes.js`, and every publish required rebuilding Go binaries for all platforms, which then shipped into every generated project via the scaffolder's preserved-files list. We are reverting to a Node CLI written in TypeScript and deleting all Go tooling.

## Considered Options

- **Keep Go** — Rejected: cross-compile step before every publish, ~1.5MB×4 binaries carried into every generated project, and duplication with the already-wired Node implementation.
- **Plain JS (status quo)** — Rejected: the CLI grows into route management, build glue, and codegen; untyped logic on a codebase this size is a liability.

## Consequences

- One toolchain (`node` + `tsc`); no cross-compile step.
- Generated projects no longer carry Go binaries or wrapper scripts.
- Cold-start is slower than Go — accepted: route commands run infrequently, and the CLI avoids heavy deps at import time.
- The deliberate Go detour is recorded here so future readers don't re-litigate it.

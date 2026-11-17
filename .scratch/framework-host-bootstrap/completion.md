# Framework host bootstrap and route-path validation

Status: Done. Parent issue #106 and all four child issues are closed.

- [x] #107: preserve framework identifiers by rule, PR #111.
- [x] #108: reject empty, dot, encoded-dot, and backslash route paths in both runtimes and the route CLI, PR #112.
- [x] #109: move environment and content-root bootstrap into PoyoHost.CreateBuilder, PR #113.
- [x] #110: apply the configured path base through UsePoyoPathBase, PR #114.
- [x] ADR 0021, AGENTS.md, package documentation, and exact upgrade notes.
- [x] Framework, scaffolder, server, depth-7 model, and packed-tarball Chromium gates.

Merged at eff79540289a26bc97599534967c4c34bf342467. The approved AGENTS.md lifecycle correction is included in de6ee6b. Post-merge CI and CodeQL passed. The test run left tracked files unchanged.

GitHub is authoritative: https://github.com/rubichandrap/Poyo/issues/106
Completion evidence: https://github.com/rubichandrap/Poyo/issues/106#issuecomment-6945765242

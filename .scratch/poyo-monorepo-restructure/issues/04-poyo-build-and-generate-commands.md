# 04 — feat(poyo): build and generate commands

**What to build:** A developer can run `poyo build` to sync the client bundle into the server's `wwwroot` and `poyo generate` to produce TypeScript DTOs and Zod schemas from the server's OpenAPI document — the build glue and codegen formerly living in repo scripts. The template's build is wired through the project CLI.

**Blocked by:** 03 — route management commands.

**Status:** done

- [x] `poyo build` reads the Vite manifest, copies only active assets into `wwwroot/generated`, prunes stale files, and rewrites `_ReactAssets.cshtml` with the current entry JS/CSS.
- [x] `poyo generate` produces TypeScript DTOs from the server OpenAPI document and Zod validation schemas from those DTOs.
- [x] The template's `build` script runs `poyo build`; `scripts/generate-manifest.js` and the old codegen scripts are deleted.
- [x] Tests at the CLI seam: `build` and `generate` run against a temp fixture project, asserting manifest and generated output.

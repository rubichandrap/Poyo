# TypeScript 6.0 migration and client tsconfig path modernization

TypeScript 6.0 deprecates the legacy `baseUrl` compiler option when used with modern module resolution (`"moduleResolution": "bundler"`). The Template (`packages/poyo-template/poyo.client`) previously specified `"baseUrl": "."` alongside `"~/*": ["src/*"]` in both `tsconfig.app.json` and `tsconfig.json`. Compiling with TypeScript 6.0 emitted `error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0`. Additionally, the monorepo's tooling packages (`@rubichandrap/poyo` and `@rubichandrap/create-poyo-app`) were pinned to TypeScript 5.9.3.

Upgrading across the monorepo also surfaced that `openapi-typescript` (7.13.0) specifies a peer dependency of `typescript: "^5.x"`, which produces an unmet peer dependency warning in `pnpm` despite the codegen functioning correctly.

**Decision**:

1. *(Superseded: every package pins TypeScript 5.9.3 in lockstep — see Amendment; original text in `archive/0011-superseded.md`.)*
2. **Modernize template path mappings without `baseUrl`**:
   - In `packages/poyo-template/poyo.client/tsconfig.app.json` and `tsconfig.json`, remove `"baseUrl": "."` completely.
   - Update path alias mappings from `"~/*": ["src/*"]` to explicit relative paths `"~/*": ["./src/*"]`.
   - `vite.config.ts` requires no change as Vite's `resolve.alias` already maps `~` directly via `path.resolve(__dirname, "./src")`.
3. *(Superseded: no peer suppression; `release:check` runs a peer gate — see Amendment.)*
4. *(Superseded with decision 1.)*

**Status**: accepted; decisions 1, 3 and 4 superseded in 0.5.0-beta.4 (see Amendment). Decision 2 stands.

**Considered options**:

- **Silence TS5101 with `"ignoreDeprecations": "6.0"`** — Rejected: Preserves deprecated configuration that will break entirely in TypeScript 7.0; Poyo generated projects should adhere to modern compiler conventions out of the box.
- **Upgrade Template only, leaving tooling on 5.x** — Rejected: Creates compiler and type-checking drift between framework runtime exports (`@rubichandrap/poyo/runtime`) and template consumers.
- **Caret ranges (`^6.0.3`)** — Rejected: Inconsistent with Poyo's invariant of exact dependency pinning across monorepo packages.

**Consequences**:

- Template `tsconfig` files carry no `baseUrl` and stay valid for future TypeScript releases (decision 2).
- The TypeScript 6.0 consequences are superseded with decisions 1, 3 and 4 (archived).

## Amendment — TypeScript returns to 5.9.3 (0.5.0-beta.4, release candidate R14)

Decisions 1, 3 and 4 are superseded; decision 2 (no `baseUrl`, `"~/*": ["./src/*"]`) stands, because it is valid under TypeScript 5.9 as well and keeps the template ready for 7.0.

- **Why**: decision 3 did not resolve the peer conflict, it hid it. `openapi-typescript@7.13.0` declares `typescript: "^5.x"`; with `allowedVersions` the template installed warning-free in this repository, but a generated project installed with `--strict-peer-dependencies` (or any tool that honours declared peers) failed. A stable template must not ship a known peer conflict.
- **Decision**: every package pins `"typescript": "5.9.3"` — still in lockstep, still exact, which keeps the rest of decision 1's reasoning — and the `pnpm.peerDependencyRules.allowedVersions` suppression is removed. `pnpm run release:check` runs a peer gate (`scripts/assert-peer-compat.mjs`) over the versions pnpm actually resolved, with the range model in `scripts/peer-ranges.mjs` checked against independent predicates; a range the model cannot read fails the gate.
- **Revisit when**: `openapi-typescript` declares a TypeScript 6 peer range. Move all pins together, and let the peer gate, not a suppression, prove it.
- **Process note**: the 0.5.0-beta.4 change reversed this ADR without amending it, which `AGENTS.md` asks contributors not to do. This amendment was added in 0.5.1.

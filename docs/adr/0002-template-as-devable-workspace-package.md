# Template as a devable workspace package

The scaffolder copies the entire repo — including tooling (Go binaries, route scripts, build glue) — into every generated project, so consumers inherit scaffold internals they should never see. Following the create-next-app model, generated projects should receive a clean skeleton and consume tooling as a dev dependency. The skeleton therefore lives as its own published package, `@rubichandrap/poyo-template`, under `packages/`, developed live as a pnpm workspace member and copied wholesale by the scaffolder.

## Considered Options

- **Root-as-skeleton with a `files` whitelist** — Rejected: the copy contract drifts as the repo grows (every new dev file must be added or it ships into generated projects).
- **Static bundled template dir inside the scaffolder** (literal Next.js) — Rejected: the skeleton *is* the product and is developed live; a static snapshot cripples the framework's own dev loop.
- **Separate template repository** — Rejected: version skew and publish coordination between scaffolder and template for a one-person project.

## Consequences

- Zero-drift copy: the scaffolder copies the template package directory wholesale and rewrites `package.json` (project name, `poyo` dev dependency version).
- The skeleton remains devable via `pnpm --filter poyo-template dev`; its sub-apps (`poyo.client`, `Poyo.Server`) are registered as workspace members so the filter resolves.
- The root workspace install pulls in the skeleton's dependencies even when only tooling is wanted — a one-time install cost, accepted.
- The template is published and pulled from the registry by the scaffolder, keeping the template package the single source of truth.

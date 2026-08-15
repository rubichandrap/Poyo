# @rubichandrap/poyo

The Poyo framework package: the project CLI (route management, production asset sync, and OpenAPI-to-TypeScript code generation) plus the client runtime (`usePage` from `@rubichandrap/poyo/runtime`). Installed as a dev dependency in projects created from the Poyo template — the analogue of `next` in a Next.js project.

## Install

```bash
pnpm add -D @rubichandrap/poyo
```

Projects scaffolded with `@rubichandrap/create-poyo-app` already include it.

## Commands

```bash
poyo --help       # command overview
poyo --version

poyo route add    User/Profile                       # register route, scaffold page + view
poyo route add    /Admin -c AdminController -a Index # custom controller
poyo route add    /Login --guest                     # guest access (login/landing pages)
poyo route add    User/Profile --no-view             # skip view generation
poyo route update User/Profile --public true
poyo route remove User/Profile                       # prompt to delete files
poyo route remove User/Profile --yes                 # delete files without prompting
poyo route sync                                      # reconcile routes.json with files on disk

poyo build        # sync the Vite bundle into the server's wwwroot and rewrite _ReactAssets.cshtml

poyo generate     # generate TS DTOs + Zod schemas from the OpenAPI document
poyo generate ./openapi.json   # ... from a local file (defaults to VITE_OPENAPI_URL)
```

## Route management

`poyo route add` appends an entry to `routes.json` and scaffolds the matching React page and Razor view. Routes carry an `access` field — one of `public` | `guest` | `protected` (default `protected`), set with the `--public`/`--guest` flags — plus flat or folder page layouts (`--flat`) and custom controllers (`--controller` + `--action`). Legacy `isPublic`/`isGuestOnly` fields are rejected as unknown, not migrated.

`poyo route sync` runs both directions: forward (fix missing files, rescaffold) and reverse (detect untracked pages, offer to register them).

## Build sync

`poyo build` reads the Vite manifest, copies the built assets into `wwwroot/generated`, prunes stale files, and rewrites `_ReactAssets.cshtml` with the current entry JS/CSS — so Razor views always reference the correct hashed filenames.

## Client runtime

The package also ships the browser runtime generated projects import — the analogue of `next/router` in a Next.js project:

```tsx
import { usePage } from "@rubichandrap/poyo/runtime";

const data = usePage<{ message: string }>(); // typed server data, or null
```

`usePage<T>()` reads `window.SERVER_DATA` — the channel the server fills from `ViewBag.ServerData` — once per page load. It is SSR-safe (returns `null` without a `window`) and resolves to `null` for missing, null, array, or primitive payloads; only a plain object is returned. The package declares `Window.SERVER_DATA?: unknown` globally, and `react` is an optional peer dependency — the module itself imports nothing and is safe for any bundler.

## Development

```bash
pnpm install
pnpm run build        # compile TypeScript
pnpm run test         # build + vitest
pnpm run lint         # biome
```

## License

MIT

# @rubichandrap/poyo

The Poyo project CLI: route management, production asset sync, and OpenAPI-to-TypeScript code generation. Installed as a dev dependency in projects created from the Poyo template — the analogue of `next` in a Next.js project.

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
poyo route add    /Login --guest                     # guest-only (redirects authenticated users)
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

`poyo route add` appends an entry to `routes.json` and scaffolds the matching React page and Razor view. Routes support auth flags (`--public`, `--guest`), flat or folder page layouts (`--flat`), and custom controllers (`--controller` + `--action`).

`poyo route sync` runs both directions: forward (fix missing files, rescaffold) and reverse (detect untracked pages, offer to register them).

## Build sync

`poyo build` reads the Vite manifest, copies the built assets into `wwwroot/generated`, prunes stale files, and rewrites `_ReactAssets.cshtml` with the current entry JS/CSS — so Razor views always reference the correct hashed filenames.

## Development

```bash
pnpm install
pnpm run build        # compile TypeScript
pnpm run test         # build + vitest
pnpm run lint         # biome
```

## License

MIT

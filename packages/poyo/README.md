# @rubichandrap/poyo

The Poyo framework package: the project CLI (route management, production asset sync, and OpenAPI-to-TypeScript code generation), the client runtime (`usePage`, route resolution via `createRouteTable`, and dynamic navigation from `@rubichandrap/poyo/runtime`), and the C# server core it carries and generated projects compile in place. Installed as a dev dependency in projects created from the Poyo template — the analogue of `next` in a Next.js project.

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

poyo generate     # emit the typed route manifest + generate TS DTOs/Zod schemas from the openapi/openapi.json snapshot
poyo generate ./custom-spec.json   # ... from a custom local file override
```

## Route management

`poyo route add` appends an entry to `routes.json` and scaffolds the matching React page and Razor view. Routes carry an `access` field — one of `public` | `guest` | `protected` (default `protected`), set with the `--public`/`--guest` flags — plus flat or folder page layouts (`--flat`) and custom controllers (`--controller` + `--action`). Legacy `isPublic`/`isGuestOnly` fields are rejected as unknown, not migrated.

`poyo route sync` runs both directions: forward (fix missing files, rescaffold) and reverse (detect untracked pages, offer to register them).

A route may also carry `dynamic: false` — an optional boolean (default `true`) that opts the route out of dynamic navigation. There is no flag for it; edit `routes.json` by hand and the CLI validates and preserves the field on every read and write (a non-boolean fails with the route named, as does the server's boot validation).

Every route command re-emits the typed route manifest (`<client>/routes.generated.ts`) — the registry stays the only edited source of truth.

## Build sync

`poyo build` reads the Vite manifest, copies the built assets into `wwwroot/generated`, prunes stale files, and rewrites `_ReactAssets.cshtml` with the current entry JS/CSS — so Razor views always reference the correct hashed filenames.

## Client runtime

The package also ships the browser runtime generated projects import — the analogue of `next/router` in a Next.js project:

```tsx
import { usePage } from "@rubichandrap/poyo/runtime";

const data = usePage<{ message: string }>(); // typed server data, or null
```

Page data is authored only by controller actions that return `this.PoyoPage(data)`. The shared layout embeds that object safely through `@Html.PoyoPageData()` into `window.SERVER_DATA`, which seeds the navigation store on initial load. Dynamic navigation commits the descriptor's structurally equal `pageData` to the same store. `usePage<T>()` is SSR-safe (returns `null` without a `window`) and resolves to `null` for missing, null, array, or primitive payloads; only a plain object is returned. The package declares `Window.SERVER_DATA?: unknown` globally, and `react` is an optional peer dependency — the module itself imports nothing and is safe for any bundler.

Route resolution ships here too (ADR 0006): `createRouteTable(manifest, loaders, { baseUrl, dev, onWarn, onError })` builds the per-load route table — `{ routes, routeMap, findRouteByName, findRouteGeneric, detectGhostRoutes }` — binding registry entries to lazy page components with exact-name-then-case-insensitive lookups, base-path stripping, dev-only ghost detection, and warn+skip for missing page files (one bad entry must not blank the bundle). The generated project keeps only a thin adapter (`src/routes/route-loader.ts`) that globs its pages, resolves the server-injected base path (`data-base-path`; `VITE_BASE_URL` is the standalone-dev fallback), and calls this factory. The registry stays the source of truth — the route table is derived from it.

### Navigation

Dynamic navigation ships from the runtime's subpaths — the `next/link` / `next/router` split:

```tsx
import { Link } from "@rubichandrap/poyo/runtime/link";         // declarative
import { useRouter } from "@rubichandrap/poyo/runtime/router";  // programmatic
```

`useRouter()` exposes `push`, `replace`, `back`, `forward`, and the current route as reactive state; `createRouter(options)` builds a standalone instance. `<Link>` runs its own click rules — primary button, no modifier keys, same-origin inside the base path, no `target`/`download`, `data-dynamic-nav="off"` honored — and keeps native browser behavior for everything else. Both are re-exported from the runtime root.

One navigation path: fetch the page descriptor (`X-Poyo-Navigation: 1`) → shape-check it → resolve the page through the route table → commit route and page data to the store `usePage` reads → write history → apply SEO, move focus, announce the swap. Browser Back/Forward traverse the same way with the scroll position restored per history entry; a cold entry (a URL the client never navigated to) is an ordinary document load. Rapid successive pushes are last-write-wins. Every failure — non-2xx, non-descriptor body, unknown page name, apply error — degrades to a document load of the same URL: the browser's own navigation is the floor.

`routePath(name)` resolves a typed route name to its canonical path from the active route table (registered when the route loader calls `createRouteTable`); calling it before registration throws a clear initialization error.

Routes with `"dynamic": false` in the registry are document-only: the server answers the document even when a request carries the navigation header.

## Server core

The package ships the C# server core as readable source under `server/` (fixed namespace `Poyo.Framework`): `RoutePolicy` (strict registry validation and route mapping), `RouteDefinition`, the universal `RouteAccessFilter` and `SeoPolicyFilter`, `PageResult` (the single result type answering both the document and the `X-Poyo-Navigation` JSON descriptor, with `Vary` set), `PageController`, `ControllerExtensions.PoyoPage(data)` for controller-authored Page data, `HtmlHelperExtensions.PoyoPageData()` for safe document embedding, and the `AddPoyo()` / `MapPoyoRoutes()` registration extensions. `PoyoPage` accepts only a JSON object or `null`; arrays and primitives fail at the controller seam.

Generated projects compile it in place through their csproj (`Compile Include="../node_modules/@rubichandrap/poyo/server/**/*.cs" LinkBase="Framework"`), so the files appear in the IDE under a `Framework` link and take part in the server build with no copy step, no feed, and no separate package. `pnpm update @rubichandrap/poyo` therefore upgrades server-side framework code along with the CLI and the runtime; a missing package fails the build with "run `pnpm install`". Never published to NuGet and never copied into a project tree — the installed files are read-only teaching material.

## Development

```bash
pnpm install
pnpm run build        # compile TypeScript
pnpm run test         # build + vitest
pnpm run lint         # biome
```

## License

MIT

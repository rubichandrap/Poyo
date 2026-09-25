# Poyo

A minimal React + .NET 10 Multi-Page Application (MPA) starter. Server-rendered React pages with hydration, demo cookie authentication, server data injection, and a route-management CLI.

## Quick start

Prerequisites: Node.js 20+, .NET 10 SDK, and pnpm.

To scaffold a new project:
```bash
npx @rubichandrap/create-poyo-app@latest MyApp
# or: pnpm dlx @rubichandrap/create-poyo-app@latest MyApp
# or: pnpm create @rubichandrap/poyo-app@latest MyApp
cd MyApp
```

Development:
```bash
pnpm run restore   # install JS dependencies and restore .NET packages
pnpm run generate  # generate TypeScript DTOs + Zod schemas from offline OpenAPI snapshot
pnpm run dev       # start the .NET watch server (recommended full-stack MPA dev; alias for server:watch)
```

> **Why `pnpm run generate`?**
> The OpenAPI snapshot (`openapi/openapi.json`) is committed, but generated TypeScript DTOs and Zod validation schemas (`src/schemas/dtos.generated.ts`, `src/schemas/validations.generated.ts`) and the route manifest (`routes.generated.ts`) are gitignored. Running `pnpm run generate` builds the validation schemas offline from the snapshot and emits the ambient route manifest without needing a backend running.

Demo login: `demo` / `password`.

## Layout

```
Poyo.Server/      # ASP.NET Core MVC server
  Controllers/    #   view controllers (root) + API controllers (Api/)
  Middleware/     #   global error handling
  Models/         #   DTOs
  Services/       #   business logic
  Views/          #   Razor views
poyo.client/      # React client (Vite + TypeScript + Tailwind)
  routes.generated.ts # gitignored typed route manifest (ambient augmentation)
  openapi/        #   committed offline OpenAPI snapshot (openapi.json)
  src/main.tsx    #   client build entry (no index.html — Razor views own every document)
  src/pages/      #   one React page per route
  src/routes/     #   route adapter (route-loader.ts)
  src/hooks-api/  #   TanStack Query hooks
  src/services/   #   API services
  src/schemas/    #   generated DTOs + Zod schemas
routes.json       # route registry: URL path -> page + view
```

The server carries no routing code of its own: `Poyo.Server.csproj` compiles the framework's server core (`RoutePolicy`, the access/SEO filters, `PageResult`, `PageController`) straight from the installed `@rubichandrap/poyo` package, visible in your IDE under a `Framework` link. Run `pnpm install` before the first server build — that is where those files come from, and a build without them fails with that instruction.

## Routes

`routes.json` is the single source of truth for route existence. Each entry maps a URL path to its React page and Razor view, with an access model and SEO metadata:

```json
{
  "path": "/Dashboard",
  "name": "Dashboard",
  "files": {
    "react": "src/pages/Dashboard/index.page.tsx",
    "view": "Views/Dashboard/Index.cshtml"
  },
  "access": "protected",
  "dynamic": true,
  "seo": { "title": "Dashboard", "description": "View your stats" }
}
```

`access` is one of `public` | `guest` | `protected` (default `protected`). The server enforces it for every registry route — custom-controller routes included — so no per-action attributes are needed: `protected` challenges anonymous users (redirect to login, 401 for API calls), `guest` redirects authenticated users to the landing page, `public` is open. Registry `seo` (title, description, meta, JSON-LD) is applied to every route, with the route name as the default title.

`dynamic` is an optional boolean (default `true`): set `false` to keep a route document-only, out of dynamic navigation (the `Register` route in this project is the example). Edit it by hand in `routes.json` — the CLI validates and preserves it, and a non-boolean value fails loudly with the route named.

On the client, `src/routes/route-loader.ts` is a thin Vite-boundary adapter: it globs the page files, resolves the server-injected base path (`data-base-path` on the mount root or `<body>`; `VITE_BASE_URL` is the standalone-dev fallback), and calls `createRouteTable` from `@rubichandrap/poyo/runtime` with `routes.json` — route resolution ships from the framework package, not from this project. The typed manifest `routes.generated.ts` is gitignored at the client package root and kept fresh by every route command and `poyo generate` — use `routePath("Login")` (imported from `@rubichandrap/poyo/runtime`) for static links so a renamed route breaks the build instead of 404ing.

Manage routes with the `poyo` CLI (a dev dependency of this project):

```bash
pnpm run route:add    User/Profile          # register route + scaffold page and view
pnpm run route:add    /Login --guest        # guest route (login/landing pages)
pnpm run route:add    /Admin --controller AdminController --action Index
pnpm run route:remove User/Profile
pnpm run route:update User/Profile --public true
pnpm run route:sync                        # reconcile routes.json with files on disk
```

## Dynamic navigation

Internal navigation swaps only the page component below the loaded shell, so providers, the React Query cache, and any long-lived client state survive. It is explicit — a plain `<a>` stays a full document load:

```tsx
import { Link } from "@rubichandrap/poyo/runtime/link";
import { useRouter } from "@rubichandrap/poyo/runtime/router";

<Link href={routePath("Login")}>Sign in</Link>

const router = useRouter();
await router.push(routePath("Dashboard"));   // also: replace, back, forward
```

`useRouter().route` is the shell's reactive current route, and `usePage()` returns the destination page's data after every swap. Browser Back/Forward swap pages the same way, with scroll positions restored per history entry; a URL the client never navigated to is an ordinary document load. Descriptor fetches use `credentials: "same-origin"`, so the current HTTP-only cookie is included for same-origin page requests but never for cross-origin requests. Every failure — an unreachable descriptor, an unknown page, an apply error — falls back to a document load of the same URL, so the worst case is what a plain link would have done. Navigation requests are access-enforced exactly like the document: a protected page's descriptor challenges anonymous callers instead of leaking its payload.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm run dev` | .NET watch server (full-stack MPA: Razor views + Vite dev server; alias for `server:watch`) |
| `pnpm run server:watch` | .NET watch server (dotnet watch) |
| `pnpm run client:dev` | standalone Vite client dev server |
| `pnpm run generate` | generate TypeScript DTOs + Zod schemas from offline OpenAPI snapshot |
| `pnpm run client:generate` | alias for `pnpm run generate` |
| `pnpm run build` | client build + `poyo build` asset sync + server build |
| `pnpm run route:*` | route management (`route:add`, `route:remove`, `route:update`, `route:sync`) |

## Page data

Page data is strictly authored by controllers. A route that needs data is mapped to a custom controller action that returns `this.PoyoPage(data)`; Razor views only render the React mount point:

```csharp
public IActionResult Index()
{
    var data = new { message = "Hello from server!" };
    return this.PoyoPage(data);
}
```

The shared layout embeds the controller-supplied object safely through `@Html.PoyoPageData()`:

```cshtml
@using Poyo.Framework
@Html.PoyoPageData()
```

React reads the initial value with `usePage<T>()` from `@rubichandrap/poyo/runtime`; dynamic navigation supplies the destination's `pageData` to the same hook. The representation matches the same normalized value, while a later controller invocation may produce fresh time-varying fields:

```tsx
import { usePage } from "@rubichandrap/poyo/runtime";

const data = usePage<{ message: string }>();
```

`PoyoPage` accepts a JSON object or `null`; wrap arrays or primitives in a top-level property. The template's `DashboardController` is the worked example.

## Code generation

`pnpm run generate` (or `pnpm run client:generate`) works offline by reading the committed OpenAPI snapshot at `poyo.client/openapi/openapi.json` and writing TypeScript DTOs and Zod schemas to `poyo.client/src/schemas/`. When running the server in development or staging (`pnpm run server:watch` / `pnpm run dev:watch`), the .NET server automatically exports the latest OpenAPI snapshot in-process on boot. You can also pass a custom local file: `poyo generate ./openapi.json`.

## Poyo vs JsxCore

If you're coming from Razor and want React in place of Razor with one build and no Node in production, look at [JsxCore](https://github.com/davidwhitney/JsxCore) first. It runs React or Preact as an ASP.NET view engine. The same component renders on the server (in-process via the Jint JS engine, no Node) and in the browser for hydration. TypeScript compiles with a native `tsc` binary, there is no bundler (the browser resolves ES modules natively), view model types are generated from your C# so the two can't drift, and .NET globals are callable directly from a view.

Poyo takes the opposite approach. The React client is a separate Vite project and the .NET server only ships HTML plus `window.SERVER_DATA`. React never runs on the server. The browser does the hydration, which leaves the client free to use the whole Vite/React ecosystem (TanStack Query, React Hook Form + Zod, code-splitting, any plugin) and lets the .NET and React teams work independently. The boundary between the two is a data contract: server data injection (`usePage<T>()`) plus JSend APIs.

| | **Poyo** | **JsxCore** |
|---|---|---|
| Mental model | React client + .NET MVC server, loosely coupled | React/Preact as an ASP.NET view engine |
| Where React runs | Browser only (hydration) | Server (in-process via Jint) and browser |
| Build toolchain | Two: Vite (client) + .NET (server) | One: .NET SDK (no Node, no bundler) |
| TS compile | Vite / `tsc` in the client project | Native `tsc` binary fetched by the package |
| Model typing | OpenAPI snapshot to DTOs + Zod (you maintain) | Generated from C# automatically (no drift) |
| .NET interop | Via API calls + `SERVER_DATA` | Direct CLR globals callable from the view |
| Client freedoms | Full Vite/React ecosystem, code-splitting, plugins | Constrained to what runs in Jint and the browser |
| Best when | You want a standalone React client + structured MPA | You want React with zero Node and one build |

Choose JsxCore if you want React without leaving the .NET build, no Node in production, and C#-generated view types.

Choose Poyo if you want a decoupled React client with the full Vite/React toolchain and a registry-driven MPA (routes, access, SEO, validation), and you are fine running two build systems.

## License

MIT

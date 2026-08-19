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
pnpm run restore      # install JS dependencies and restore .NET packages
pnpm run dev:watch    # start the .NET watch server (recommended full-stack MPA dev; alias for server:watch)
# or: pnpm run dev    # start standalone Vite client dev server
```

Demo login: `demo` / `password`.

## Layout

```
Poyo.Server/      # ASP.NET Core MVC server
  Controllers/    #   view controllers (root) + API controllers (Api/)
  Routing/        #   RoutePolicy + universal access/SEO filters
  Middleware/     #   global error handling
  Models/         #   DTOs
  Services/       #   business logic
  Views/          #   Razor views
poyo.client/      # React client (Vite + TypeScript + Tailwind)
  routes.generated.ts # committed typed route manifest
  openapi/        #   committed offline OpenAPI snapshot (openapi.json)
  src/pages/      #   one React page per route
  src/routes/     #   route adapter (route-loader.ts)
  src/hooks-api/  #   TanStack Query hooks
  src/services/   #   API services
  src/schemas/    #   generated DTOs + Zod schemas
routes.json       # route registry: URL path -> page + view
```

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
  "seo": { "title": "Dashboard", "description": "View your stats" }
}
```

`access` is one of `public` | `guest` | `protected` (default `protected`). The server enforces it for every registry route — custom-controller routes included — so no per-action attributes are needed: `protected` challenges anonymous users (redirect to login, 401 for API calls), `guest` redirects authenticated users to the landing page, `public` is open. Registry `seo` (title, description, meta, JSON-LD) is applied to every route, with the route name as the default title.

On the client, `src/routes/route-loader.ts` is a thin Vite-boundary adapter: it globs the page files, resolves the server-injected base path (`data-base-path` on the mount root or `<body>`; `VITE_BASE_URL` is the standalone-dev fallback), and calls `createRouteTable` from `@rubichandrap/poyo/runtime` — route resolution ships from the framework package, not from this project. The typed manifest `routes.generated.ts` is committed at the client package root and kept fresh by every route command and `poyo generate` — use `routePath("Login")` for static links so a renamed route breaks the build instead of 404ing.

Manage routes with the `poyo` CLI (a dev dependency of this project):

```bash
pnpm run route:add    User/Profile          # register route + scaffold page and view
pnpm run route:add    /Login --guest        # guest route (login/landing pages)
pnpm run route:add    /Admin --controller AdminController --action Index
pnpm run route:remove User/Profile
pnpm run route:update User/Profile --public true
pnpm run route:sync                        # reconcile routes.json with files on disk
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm run dev:watch` | .NET watch server (full-stack MPA: Razor views + Vite dev server; alias for `server:watch`) |
| `pnpm run server:watch` | .NET watch server (dotnet watch) |
| `pnpm run dev` | standalone Vite client dev server (alias for `client:dev`) |
| `pnpm run build` | client build + `poyo build` asset sync + server build |
| `pnpm run generate` | generate TypeScript DTOs + Zod schemas from offline OpenAPI snapshot |
| `pnpm run client:generate` | alias for `pnpm run generate` |
| `pnpm run route:*` | route management (`route:add`, `route:remove`, `route:update`, `route:sync`) |

## Server data

Pass data from the server to React without an initial API call. Set `ViewBag.ServerData` in the view, then read it client-side with `usePage<T>()` — shipped from `@rubichandrap/poyo/runtime`:

```csharp
ViewBag.ServerData = JsonSerializer.Serialize(new { message = "Hello from server!" });
```

```tsx
import { usePage } from "@rubichandrap/poyo/runtime";

const data = usePage<{ message: string }>();
```

## Code generation

`pnpm run generate` (or `pnpm run client:generate`) works offline by reading the committed OpenAPI snapshot at `poyo.client/openapi/openapi.json` and writing TypeScript DTOs and Zod schemas to `poyo.client/src/schemas/`. When running the server in development or staging (`pnpm run server:watch` / `pnpm run dev:watch`), the .NET server automatically exports the latest OpenAPI snapshot in-process on boot. You can also pass a custom local file: `poyo generate ./openapi.json`.

## License

MIT

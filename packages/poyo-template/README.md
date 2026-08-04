# Poyo

A minimal React + .NET 10 Multi-Page Application (MPA) starter. Server-rendered React pages with hydration, demo cookie authentication, server data injection, and a route-management CLI.

## Quick start

Prerequisites: Node.js 20+, .NET 10 SDK, and pnpm.

```bash
pnpm run restore      # install JS dependencies and restore .NET packages
pnpm run dev          # Vite dev server with hot reload
pnpm run dev:watch    # .NET watch server (serves the Razor views)
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
  src/pages/      #   one React page per route
  src/hooks/      #   custom hooks, incl. usePage<T>()
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
| `pnpm run dev` | Vite dev server |
| `pnpm run dev:watch` | .NET watch server |
| `pnpm run build` | client build + `poyo build` asset sync + server build |
| `pnpm run client:generate` | generate TypeScript DTOs + Zod schemas from OpenAPI |
| `pnpm run route:*` | route management |

## Server data

Pass data from the server to React without an initial API call. Set `ViewBag.ServerData` in the view, then read it client-side with `usePage<T>()`:

```csharp
ViewBag.ServerData = JsonSerializer.Serialize(new { message = "Hello from server!" });
```

```tsx
const data = usePage<{ message: string }>();
```

## Code generation

`pnpm run client:generate` pulls the OpenAPI document from `VITE_OPENAPI_URL` (set in `.env`) and writes TypeScript DTOs and Zod schemas to `poyo.client/src/schemas/`. You can also pass a local file: `poyo generate ./openapi.json`.

## License

MIT

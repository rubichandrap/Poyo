# Poyo

**A minimal React + .NET 10 Multi-Page Application (MPA) starter framework**

Poyo is a minimal framework for building server-rendered React applications with .NET. It provides MPA scaffolding without dictating auth, database, or business logic.

---

## The Problem Poyo Solves

**ASP.NET MVC can only serve static files from `wwwroot/`**

When building React apps with .NET MVC, you run into a structural mismatch:

```
ASP.NET MVC only serves static files from wwwroot/
React source lives in a separate client project
You can't reference React components from Razor views directly
The workflow becomes: build React → copy to wwwroot → reference in views
This breaks hot reload and creates a painful dev loop
```

Workarounds:
1. Separate deployments (React SPA + .NET API) — loses MPA benefits
2. Manual copying — build React, copy to wwwroot (tedious, error-prone)
3. Complex build scripts — custom tooling, hard to maintain

---

## How Poyo Solves It

Poyo integrates React (Vite) with .NET MVC:

```
1. React source lives in poyo.client/ (separate project)
2. Vite compiles React → wwwroot/generated/ (automatic)
3. Manifest generation maps hashed files → Razor partials
4. Hot reload works in development (Vite dev server)
5. Production builds automatically update references
```

**Development Mode:**
```
User → .NET MVC → Razor View → Vite Dev Server (localhost:5173)
                                    ↓
                              React Hot Reload
```

**Production Mode:**
```
pnpm run build
  ↓
Vite compiles React → wwwroot/generated/index-[hash].js
  ↓
poyo build creates _ReactAssets.cshtml
  ↓
.NET MVC serves from wwwroot/ with correct hashed filenames
```

Key features: HMR in development, automatic hashed-filename management, server-side rendering for SEO, TypeScript types from OpenAPI, server data injection (pass data to React without API calls), and CLI route management.

---

## Features

- Multi-page architecture with server-side routing and React hydration
- Dynamic navigation: `useRouter()` and `<Link>` swap the page without a document reload, with Back/Forward traversal and scroll restoration
- Framework-owned server core compiled in place from the framework package — route policy, access/SEO enforcement, and the page result (no NuGet, no copied framework files)
- Demo cookie-based auth (replace with your own)
- Controller-authored Page data via `this.PoyoPage(data)`, safely embedded with `@Html.PoyoPageData()`
- React 19, TypeScript, Tailwind CSS v4, TanStack Query
- Auto-generated TypeScript types from OpenAPI
- CLI route management between server and client

---

## Architecture

Poyo is a pnpm monorepo of three packages:

```
Poyo/
├── packages/
│   ├── poyo-template/       # The skeleton (developed live)
│   │   ├── package.json     # Template scripts (dev, build, route:*)
│   │   ├── routes.json      # Routes registry
│   │   ├── Poyo.slnx        # .NET solution
│   │   ├── Poyo.Server/     # .NET 10 Server
│   │   │   ├── Controllers/ # MVC + API Controllers
│   │   │   ├── Middleware/  # Auth, Error handling
│   │   │   ├── Models/      # DTOs
│   │   │   ├── Services/    # Business logic
│   │   │   └── Views/       # Razor views
│   │   └── poyo.client/     # React Client
│   │       ├── routes.generated.ts # Gitignored typed route manifest (ambient augmentation)
│   │       ├── openapi/     # Committed offline OpenAPI snapshot (openapi.json)
│   │       ├── src/
│   │       │   ├── pages/   # React pages
│   │       │   ├── hooks-api/ # TanStack Query hooks
│   │       │   ├── services/ # API services
│   │       │   └── providers/ # Context providers
│   │       └── src/schemas/ # Auto-generated DTOs + Zod schemas
│   ├── poyo/                # Framework package (CLI + client runtime + server core)
│   └── create-poyo-app/     # Scaffolder
├── scripts/                 # Release tooling
└── .github/workflows/       # CI (release pipeline)
```

The template's server project carries no framework code of its own: its csproj compiles the server core straight from the installed `@rubichandrap/poyo` package (readable in the IDE under a `Framework` link), so `pnpm update @rubichandrap/poyo` upgrades server-side framework code along with the CLI and runtime. A missing package fails the build with a "run `pnpm install`" error.

Each package ships its own `README.md`. npm renders from the package directory, so `packages/*/README.md` documents each artifact, and `poyo-template`'s README becomes the README of every scaffolded project.

---

## Quick Start

### Prerequisites
- .NET 10 SDK
- Node.js 20+

### Installation

```bash
# Create a new project
npx @rubichandrap/create-poyo-app@latest MyApp
# or: pnpm dlx @rubichandrap/create-poyo-app@latest MyApp
# or: pnpm create @rubichandrap/poyo-app@latest MyApp

# Navigate to project
cd MyApp

# Install dependencies (React + .NET)
pnpm run restore

# Generate TypeScript DTOs and Zod schemas from the committed OpenAPI snapshot
pnpm run generate

# Run development server (full-stack MPA: .NET watch server + Vite dev server)
pnpm run dev
# or: pnpm run server:watch
```

`pnpm run generate` creates TypeScript DTOs and Zod schemas from the committed OpenAPI snapshot. The snapshot is committed; the generated schemas and route manifest are gitignored. Run once after install. The server re-exports the snapshot on boot in dev/staging.

### Demo Credentials
- Username: `demo`
- Password: `password`

---

## Core Concepts

### 1. Controller-authored Page Data (Server-Driven UI)

Page data is strictly authored by controllers. A data-bearing registry route is mapped to a custom controller action that returns `this.PoyoPage(data)`; Razor views remain presentation-only.

**Controller (C#):**
```csharp
public class DashboardController : Controller
{
    public IActionResult Index()
    {
        var data = new
        {
            message = "Hello from server!",
            timestamp = DateTime.UtcNow,
            user = User.Identity?.Name,
            notifications = GetUserNotifications(),
            settings = GetUserSettings()
        };

        return this.PoyoPage(data);
    }
}
```

Map the registry route with `"controller": "Dashboard", "action": "Index"`. Registry routes without a custom controller are served with no Page data.

**Shared layout (Razor):**
```cshtml
@Html.PoyoPageData()
```

The layout helper safely embeds the controller-supplied object as `window.SERVER_DATA`. It emits no script when Page data is absent. The same structured value is returned as `pageData` for dynamic navigation.

**View (Razor):**
```cshtml
<div id="react-root" data-page-name="Dashboard"></div>
```

**Client (TypeScript):**
```typescript
interface DashboardData {
    message: string;
    timestamp: string;
    user: string;
    notifications: Notification[];
    settings: UserSettings;
}

export default function DashboardPage() {
    const data = usePage<DashboardData>();

    if (!data) return <div>No data available</div>;

    return (
        <div>
            <h1>{data.message}</h1>
            <p>Server time: {data.timestamp}</p>
            <p>User: {data.user}</p>
        </div>
    );
}
```

How it works:
1. The controller prepares Page data and returns `this.PoyoPage(data)`.
2. `_Layout.cshtml` embeds it safely through `@Html.PoyoPageData()`.
3. React hydrates and `usePage()` reads the navigation store seeded from `window.SERVER_DATA`.
4. Dynamic navigation replaces the store's data with the destination descriptor's structurally equal `pageData`.

`PoyoPage` accepts a JSON object or `null`; arrays and primitives are rejected. Wrap non-object data in a property such as `{ items = values }`. There is no initial Page data API call or loading spinner, and TypeScript constrains the client shape.

### 2. Route Management

Routes are defined in `routes.json` and can now support **Custom Controllers** and **Flexible SEO**:

```json
{
  "path": "/Dashboard",
  "name": "Dashboard",
  "files": {
    "react": "src/pages/Dashboard/index.page.tsx",
    "view": "Views/Dashboard/Index.cshtml"
  },
  "access": "protected",
  "dynamic": true,                     // Optional: false opts out of dynamic navigation
  "controller": "Dashboard",          // Optional: Use custom controller
  "action": "Index",                   // Optional: Custom action
  "seo": {                             // Optional: SEO Metadata
    "title": "My Dashboard",
    "description": "View your stats",
    "meta": {
       "og:image": "https://..."
    },
    "jsonld": {
       "@type": "WebPage"
    }
  }
}
```

`access` is one of `public` | `guest` | `protected` (default `protected`). `guest` routes (login, landing pages) redirect authenticated users away; `protected` routes redirect anonymous users to the login page; `public` routes are open to everyone. Access and SEO are enforced server-side for every registry route — custom-controller routes included — so no per-action attributes are needed. Legacy `isPublic`/`isGuestOnly` flags are rejected as unknown fields.

Route resolution ships from `@rubichandrap/poyo/runtime`. The generated project's `src/routes/route-loader.ts` globs pages, resolves the server-injected base path, and calls `createRouteTable` with `routes.json`. `routes.generated.ts` is gitignored at the client root and kept fresh by every route command and `poyo generate`. Use `routePath("Login")` (imported from `@rubichandrap/poyo/runtime`) for static links so a renamed or removed route is a build error instead of a 404.

CLI commands: see the [Scripts](#scripts) section below.

`dynamic` (optional boolean, default `true`) opts a route out of dynamic navigation — see below.

### 3. Dynamic Navigation

An internal navigation swaps only the page component below the loaded shell, so providers, the React Query cache, and any long-lived client state survive. Navigation is explicit — the two APIs below, never a global anchor interceptor: a plain `<a>` is a document load, by design.

```tsx
import { Link } from "@rubichandrap/poyo/runtime/link";
import { useRouter } from "@rubichandrap/poyo/runtime/router";

// Declarative — mirrors next/link
<Link href={routePath("Dashboard")}>Dashboard</Link>

// Programmatic — mirrors next/router
const router = useRouter();
await router.push(routePath("Dashboard"));
await router.replace(routePath("Login"));
router.back();
router.forward();
```

- `useRouter()` exposes `push`, `replace`, `back`, `forward`, and the current route as reactive state (`route`); `usePage()` returns the destination page's data after every swap.
- After a client-side navigation, browser Back/Forward swap pages the same way, with the scroll position stored per history entry and restored on return. A cold entry — a URL the client never navigated to — is an ordinary document load.
- Every failure (non-2xx, a non-descriptor body, an unknown page, an apply error) degrades to a document load of the same URL. The worst case is exactly what a plain link would have done.
- `"dynamic": false` in `routes.json` makes a route document-only: the server answers the document even for a navigation request. The template's `Register` route is the worked example.
- Navigation requests carry the `X-Poyo-Navigation: 1` header; the server answers the JSON page descriptor (`{ name, seo, pageData }`) with `Vary: X-Poyo-Navigation`. Access is enforced first, so a protected route's descriptor challenges anonymous callers instead of leaking its payload.

### 4. Flexible SEO

Data-driven SEO — no `.cshtml` edits for metadata.
- **Title/Description**: Set in `routes.json`.
- **Meta Tags**: Dictionary in `routes.json` (supports OpenGraph).
- **JSON-LD**: Inject structured data scripts automatically.

All metadata is injected server-side into `_Layout.cshtml` before the React app even loads, ensuring perfect SEO.

### 5. Authentication

Hybrid auth strategy:

1.  **Web (Browser): HttpOnly Cookies**
    *   **Why?** Protected against XSS (JavaScript can't read them). Browsers send them automatically.
    *   **How?** Server sets an `AspNetCore.Cookies` cookie on login.

2.  **Mobile (Native Apps): JWT (Bearer Token)**
    *   **Why?** flexible for native HTTP clients where cookies are clumsy.
    *   **How?** Login API returns a token. Mobile apps send it in `Authorization: Bearer <token>`.

3.  **Client UI: "UI Token"** — A non-sensitive flag in `localStorage` for instant UI state (showing Login/Logout). The server always validates the cookie or bearer token for access control, regardless of what the UI token says.

Access rules live in `routes.json`, enforced universally by a server-side filter:

```json
{
  "path": "/Login",
  "name": "Login",
  "files": { "react": "src/pages/Login/index.page.tsx", "view": "Views/Login/Index.cshtml" },
  "access": "guest"
}
```

- `protected` (default): anonymous users are challenged → redirected to the login page (or 401 for API calls)
- `guest`: authenticated users are redirected to the landing page (`/Dashboard` by default)
- `public`: open to everyone

---

## Tech Stack

### Server
- .NET 10
- ASP.NET Core MVC
- Cookie Authentication

### Client
- React 19
- TypeScript
- Vite (Rolldown)
- TanStack Query
- React Hook Form + Zod
- Tailwind CSS v4
- Axios

---

## Project Structure

### Key Files

- `routes.json` - Route definitions
- `Poyo.Server/Program.cs` - Server configuration
- `poyo.client/src/app.tsx` - Client entry point
- `poyo.client/src/routes/route-loader.ts` - Vite-boundary route adapter (thin; resolution ships from the framework)
- `poyo.client/routes.generated.ts` - Typed route manifest (gitignored ambient augmentation at client package root, kept fresh by route commands and poyo generate)
- `poyo.client/openapi/openapi.json` - Committed offline OpenAPI snapshot (refreshed in-process on server boot in dev/staging)
- `@rubichandrap/poyo/runtime` - Client runtime: server data hook (`usePage`), route table (`createRouteTable`), and the typed `routePath` helper
- `@rubichandrap/poyo/runtime/router` - Programmatic navigation (`useRouter`, `createRouter`)
- `@rubichandrap/poyo/runtime/link` - Declarative navigation (`Link`)
- `@rubichandrap/poyo/server` - The C# server core compiled into `Poyo.Server` in place (readable teaching material, never copied)

### Important Directories

- `Poyo.Server/Controllers/` - MVC controllers
- `Poyo.Server/Controllers/Api/` - API controllers
- `Poyo.Server/Middleware/Error/` - Global exception handler
- `Poyo.Server/Services/Auth/` - Demo auth service (replace with your own)
- `poyo.client/src/pages/` - React pages
- `poyo.client/src/schemas/` - Generated DTOs + Zod schemas

---

## What's Included

### Server Components
- Cookie authentication
- Demo auth service (replace with your own)
- MVC routing
- Framework-owned server core compiled in place from the framework package (route policy, access/SEO filters, `PageResult`) — no NuGet, no copied framework files
- Controller-authored Page data (`ControllerExtensions.PoyoPage`) with safe layout embedding (`HtmlHelperExtensions.PoyoPageData`)
- Registry-driven access model (`access` in `routes.json`, enforced universally)
- Error handling
- JSend response wrapper

### Client Components
- React 19 + TypeScript
- Form validation (React Hook Form + Zod)
- Data fetching (TanStack Query)
- Server data hook (`usePage<T>()`)
- Route resolution (`createRouteTable`, from the framework runtime)
- Dynamic navigation (`useRouter`, `Link`) with Back/Forward traversal and scroll restoration
- Typed route names (`routePath`, from the framework runtime)
- Route management CLI
- Tailwind CSS v4

---

## Customization

### Replace Demo Auth

The framework includes hardcoded demo auth. Replace `AuthService.cs` with your own implementation:

```csharp
// Poyo.Server/Services/Auth/AuthService.cs
public class AuthService : IAuthService
{
    // Replace with real authentication
    // - ASP.NET Core Identity
    // - JWT tokens
    // - OAuth/OIDC
    // - Your custom solution
}
```

### Add Database

The framework doesn't include database access. Add your own:

```bash
# Entity Framework Core
dotnet add package Microsoft.EntityFrameworkCore.SqlServer

# Or Dapper
dotnet add package Dapper
```

### Customize Styling

Update Tailwind configuration in `poyo.client/src/index.css`:

```css
@theme {
    --font-sans: YourFont, system-ui, sans-serif;
    /* Add your theme variables */
}
```

---

## Code Generation

Code generation keeps the client and server in sync.

### 1. DTO and Validation Schema Generation

Generates TypeScript DTOs and Zod schemas from the committed OpenAPI snapshot.

```bash
pnpm run generate   # or: pnpm run client:generate
```

- Works completely offline out of the box using the committed OpenAPI snapshot at `poyo.client/openapi/openapi.json`
- In development/staging, running the .NET server (`pnpm run dev` or `pnpm run server:watch`) automatically exports the latest OpenAPI snapshot in-process on boot without loopback network calls
- Generates TypeScript types using `openapi-typescript`
- Creates Zod validation schemas using `openapi-zod-client`
- Outputs to `src/schemas/dtos.generated.ts` and `src/schemas/validations.generated.ts`
- Pass a custom local file if needed: `poyo generate ./custom-spec.json`
- Use the generated schemas in forms with `zodResolver`

### 2. Build Asset Sync

Syncs the production bundle into the server's `wwwroot`.

```bash
pnpm run build   # client build + poyo build + server build
```

In development, Vite serves assets directly from its dev server. In production, Vite builds with hashed filenames that change every build. The Razor views need to reference these files, but the filenames change.

In production, Vite builds assets with hashed filenames:
```
dist/generated/
├── index-C2LBw7bc.css      ← Hash changes every build!
├── index-COWd0_qB.js        ← Hash changes every build!
└── vendor-SQrKxH4E.js       ← Hash changes every build!
```

`poyo build` reads Vite's manifest and generates `_ReactAssets.cshtml`:

```cshtml
<!-- Auto-generated - DO NOT EDIT -->
<link rel="stylesheet" href="/generated/index-C2LBw7bc.css" />
<script type="module" src="/generated/index-COWd0_qB.js"></script>
<script type="module" src="/generated/vendor-SQrKxH4E.js"></script>
<!-- Hashes updated automatically on every build! -->
```

How it works:
1. `pnpm run build` compiles the React app
2. Vite creates `.vite/manifest.json` with file mappings
3. `poyo build` reads the manifest and generates `_ReactAssets.cshtml` with correct hashed filenames
4. `_Layout.cshtml` includes this partial in production

Without it: 404s, stale cached assets, or a broken deployment.

Runs automatically as part of `pnpm run build`, or manually with `poyo build`.

Input: `poyo.client/dist/.vite/manifest.json`. Output: `Poyo.Server/Views/Shared/_ReactAssets.cshtml`. Used by: `Poyo.Server/Views/Shared/_Layout.cshtml`.

### 3. Route Management CLI

Add a route:
```bash
pnpm run route:add User/Profile
# OR (with flags)
pnpm run route:add -- /Register --guest
```

From the monorepo root (template development):
```bash
# From the repo root (template development)
pnpm --filter poyo-template run route:add /User/Profile --guest
```
In a generated project, run `pnpm run route:add /User/Profile --guest` directly from the project root.

The command:
1.  **Updates `routes.json`**: Adds entry mapping `/User/Profile` to the React page and Razor view.
2.  **Scaffolds React Page**: Creates `poyo.client/src/pages/User/Profile/index.page.tsx`.
    *   *Optionally use `--flat` for `src/pages/User/profile.page.tsx` style.*
3.  **Scaffolds Razor View**: Creates `Poyo.Server/Views/User/Profile/Index.cshtml`.
    *   *Sets up the `#react-root` div with `data-page-name="User/Profile"` for hydration.*

Remove a route:
```bash
pnpm run route:remove User/Profile
```
Prompts to optionally delete both the React page and MVC View.

Sync routes:
```bash
pnpm run route:sync
```
- Forward sync: checks for missing files, offers Rescaffold or Prune.
- Reverse sync: checks for untracked React pages not in `routes.json`, offers to Add or Delete them.

---

## Scripts

### Project Root / Template
```bash
pnpm run restore          # Install JS dependencies and restore .NET packages
pnpm run generate         # Generate TypeScript DTOs + Zod schemas from offline OpenAPI snapshot
pnpm run dev              # Start .NET watch server (recommended full-stack MPA dev; alias for server:watch)
pnpm run server:watch     # Start .NET server in watch mode (dotnet watch)
pnpm run client:dev       # Start standalone Vite client dev server
pnpm run build            # Full production build (client build + asset sync + server build)
pnpm run client:generate  # Alias for generate
```

### Route Management
```bash
pnpm run route:add        # Add new route (and scaffold page + view)
pnpm run route:remove     # Remove a route
pnpm run route:update     # Toggle route access / metadata
pnpm run route:sync       # Reconcile routes.json with files on disk
```

### Server Sub-package (`Poyo.Server/`)
```bash
pnpm run server:dev       # Start server (dotnet run)
pnpm run server:watch     # Watch mode (dotnet watch)
pnpm run server:build     # Build .NET project (dotnet build)
pnpm run server:format    # Check C# formatting (dotnet format)
pnpm run server:format:fix # Fix C# formatting
pnpm run server:publish   # Publish for production
```

### Client Sub-package (`poyo.client/`)
```bash
pnpm run client:dev       # Start standalone Vite dev server
pnpm run client:build     # Build Vite production bundle
pnpm run client:type-check # Run TypeScript compiler check
```

---

## Contributing

Fork it and make it your own.

---

## License

MIT

---

## What Poyo Is and Isn't

Poyo is a React + .NET MPA starter. It ships a route registry, server data injection, and Vite integration. It does not include a database, production auth, or UI components — you add those. It is not a full-featured CMS or a replacement for Next.js/Remix.

---

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

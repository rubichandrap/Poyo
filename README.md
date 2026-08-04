# Poyo

**A minimal React + .NET 10 Multi-Page Application (MPA) starter framework**

Poyo is an ultra-lightweight framework for building server-rendered React applications with .NET. It provides the essential scaffolding for MPA architecture without imposing opinions on authentication, database, or business logic.

---

## 🎯 The Problem Poyo Solves

**ASP.NET MVC can only serve static files from `wwwroot/`**

When building React apps with .NET MVC, you face a critical challenge:

```
❌ THE PROBLEM:
- ASP.NET MVC only serves static files from wwwroot/
- React source code lives in a separate client project
- You can't directly reference React components from Razor views
- You need to build React → copy to wwwroot → reference in views
- Manual process, breaks hot reload, painful developer experience
```

**Traditional Workarounds:**
1. **Separate deployments** - React SPA + .NET API (loses MPA benefits)
2. **Manual copying** - Build React, copy to wwwroot (tedious, error-prone)
3. **Complex build scripts** - Custom tooling (hard to maintain)

---

## ✨ How Poyo Solves It

**Poyo provides a complete integration between React (Vite) and .NET MVC:**

```
✅ THE SOLUTION:
1. React source code in poyo.client/ (separate project)
2. Vite compiles React → wwwroot/generated/ (automatic)
3. Manifest generation maps hashed files → Razor partials
4. Hot reload works in development (Vite dev server)
5. Production builds automatically update references
6. Zero manual intervention required!
```

**Development Mode:**
```
User → .NET MVC → Razor View → Vite Dev Server (localhost:5173)
                                    ↓
                              React Hot Reload ✨
```

**Production Mode:**
```
pnpm run build
  ↓
Vite compiles React → wwwroot/generated/index-[hash].js
  ↓
poyo build creates _ReactAssets.cshtml
  ↓
.NET MVC serves from wwwroot/ with correct hashed filenames ✅
```

**Key Features:**
- 🔥 **Hot Module Replacement** - React changes reload instantly in dev
- 📦 **Automatic Asset Management** - Hashed filenames handled automatically
- 🚀 **Server-Side Rendering** - SEO-friendly, fast initial load
- 🎯 **Type-Safe Integration** - TypeScript types from OpenAPI
- 🔐 **Server Data Injection** - Pass data to React without API calls
- 🛠️ **Route Management** - Sync routes between server and client

---

## ✨ Features

- **🚀 Multi-Page Architecture** - Server-side routing with React hydration for SEO-friendly pages
- **🔐 Demo Authentication** - Simple cookie-based auth example (replace with your own)
- **📦 Server Data Injection** - Pass data from server to client without API calls
- **✨ Modern Stack** - React 19, TypeScript, Tailwind CSS v4, TanStack Query
- **🎯 Type-Safe APIs** - Auto-generated TypeScript types from OpenAPI
- **🛠️ Route Management** - CLI tools for managing routes between server and client

---

## 🏗️ Architecture

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
│   │       ├── src/
│   │       │   ├── pages/   # React pages
│   │       │   ├── hooks/   # Custom hooks (usePage, etc.)
│   │       │   ├── hooks-api/ # TanStack Query hooks
│   │       │   ├── services/ # API services
│   │       │   └── providers/ # Context providers
│   │       └── src/schemas/ # Auto-generated DTOs + Zod schemas
│   ├── poyo/                # Project CLI (route management, build, generate)
│   └── create-poyo-app/     # Scaffolder
├── scripts/                 # Release tooling
└── .github/workflows/       # CI (release pipeline)
```

Each package ships its own `README.md` — npm renders the readme from the package directory, so the framework docs live here while `packages/*/README.md` document each artifact (and `poyo-template`'s becomes the README of every scaffolded project).

---

## 🚀 Quick Start

### Prerequisites
- .NET 10 SDK
- Node.js 20+

### Installation

```bash
# Create a new project
npx @rubichandrap/create-poyo-app MyApp

# Navigate to project
cd MyApp

# Install dependencies (React + .NET)
pnpm run restore

# Run development servers
pnpm run dev:watch
```

### Demo Credentials
- Username: `demo`
- Password: `password`

---

## 📚 Core Concepts

### 1. Server Data Injection (Server-Driven UI)

**Pass data from server to client without API calls - like Laravel Livewire!**

Poyo allows you to inject server-side data directly into your React components, eliminating the need for initial API calls and enabling server-driven UI patterns.

**Server (C#):**
```csharp
[Authorize]
public IActionResult Dashboard()
{
    // Prepare data on the server
    var data = new
    {
        message = "Hello from server!",
        timestamp = DateTime.UtcNow,
        user = User.Identity?.Name,
        notifications = GetUserNotifications(),
        settings = GetUserSettings()
    };
    
    // Inject into ViewBag
    ViewBag.ServerData = JsonSerializer.Serialize(data);
    
    return View();
}
```

**View (Razor):**
```cshtml
@{
    ViewBag.ServerData = JsonSerializer.Serialize(new {
        message = "Data from view!",
        userId = User.FindFirst("sub")?.Value
    });
}

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
    // Access server data immediately - no loading state needed!
    // Validates that data is a non-null object
    const data = usePage<DashboardData>();
    
    if (!data) return <div>No data available</div>;

    return (
        <div>
            <h1>{data.message}</h1>
            <p>Server time: {data.timestamp}</p>
            <p>User: {data.user}</p>
            {/* Data is already here - no spinner, no API call! */}
        </div>
    );
}
```

**How it works:**
1. Server renders Razor view with data in `ViewBag.ServerData`
2. `_Layout.cshtml` injects it as `window.SERVER_DATA`
3. React hydrates and `usePage()` reads from `window.SERVER_DATA`
4. **Validation:** `usePage()` ensures data is a valid object (returns `null` otherwise).
5. **Zero API calls** for initial page load!

**Benefits:**
- ✅ **Faster initial render** - No loading spinners
- ✅ **SEO-friendly** - Data is in HTML
- ✅ **Type-safe** - TypeScript knows the shape
- ✅ **Server-driven** - Like Livewire/Inertia.js
- ✅ **Secure** - Data prepared server-side with auth context

**Use Cases:**
- User profile data
- Dashboard statistics
- Notification counts
- User preferences
- Any data needed on page load

### 2. Route Management (Enhanced)

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
  "controller": "DashboardController", // Optional: Use custom controller
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

**CLI Commands:**
```bash
# Basic Add
pnpm run route:add YourPage

# Add a guest route (login/landing pages)
pnpm run route:add /Login --guest

# Add with Custom Controller & Action
pnpm run route:add /Admin --controller AdminController --action Index

# Skip View Generation (if controller handles it)
pnpm run route:add /API/Proxy --controller ApiController --action Proxy --no-view
```

### 3. Flexible SEO System

Poyo now supports a data-driven SEO system. You don't need to touch `.cshtml` files for metadata.
- **Title/Description**: Set in `routes.json`.
- **Meta Tags**: Dictionary in `routes.json` (supports OpenGraph).
- **JSON-LD**: Inject structured data scripts automatically.

All metadata is injected server-side into `_Layout.cshtml` before the React app even loads, ensuring perfect SEO.

### 3. Authentication Strategy

Poyo uses a hybrid approach to balance security and usability:

1.  **Web (Browser): HttpOnly Cookies**
    *   **Why?** Protected against XSS (JavaScript can't read them). Browsers send them automatically.
    *   **How?** Server sets an `AspNetCore.Cookies` cookie on login.

2.  **Mobile (Native Apps): JWT (Bearer Token)**
    *   **Why?** flexible for native HTTP clients where cookies are clumsy.
    *   **How?** Login API returns a token. Mobile apps send it in `Authorization: Bearer <token>`.

3.  **Client UI: "UI Token"**
    *   **What?** A non-sensitive flag/token stored in `localStorage`.
    *   **Why?** Instant UI updates. React knows to show "Logout" instead of "Login" immediately without waiting for a server roundtrip.
    *   **Security:** This is **NOT** used for access control. The Server validates the **Cookie** (or Bearer token). If the cookie is missing/invalid, the request fails even if the UI token exists.

Access rules live in `routes.json`, not on actions. A universal filter enforces them for every registry route:

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

## 🛠️ Tech Stack

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

## 📖 Project Structure

### Key Files

- `routes.json` - Route definitions
- `Poyo.Server/Program.cs` - Server configuration
- `poyo.client/src/app.tsx` - Client entry point
- `poyo.client/src/hooks/use-page.ts` - Server data hook

### Important Directories

- `Poyo.Server/Controllers/` - MVC controllers
- `Poyo.Server/Controllers/Api/` - API controllers
- `Poyo.Server/Middleware/Auth/` - Auth attributes
- `poyo.client/src/pages/` - React pages
- `poyo.client/scripts/` - Code generation

---

## 🎯 What's Included

### Server Components
- Cookie authentication
- Demo auth service (replace with your own)
- MVC routing
- Server data injection (`[ServerData]` attribute)
- Registry-driven access model (`access` in `routes.json`, enforced universally)
- Error handling
- JSend response wrapper

### Client Components
- React 19 + TypeScript
- Form validation (React Hook Form + Zod)
- Data fetching (TanStack Query)
- Server data hook (`usePage<T>()`)
- Route management CLI
- Tailwind CSS v4

---

## 🔧 Customization

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

## 🤖 Code Generation

Poyo includes powerful code generation tools to keep your client and server in sync.

### 1. DTO + Validation Schema Generation

**Generates TypeScript DTOs and Zod schemas from the server's OpenAPI document**

```bash
pnpm run client:generate
```

- Fetches the OpenAPI spec (from `VITE_OPENAPI_URL` or a local file argument)
- Generates TypeScript types using `openapi-typescript`
- Creates Zod validation schemas using `openapi-zod-client`
- Outputs to `src/schemas/dtos.generated.ts` and `src/schemas/validations.generated.ts`
- **Requires:** Server running + `VITE_OPENAPI_URL` in `.env` (or pass a file: `poyo generate ./openapi.json`)
- Use the generated schemas in forms with `zodResolver`

### 3. Build Asset Sync ⚠️ CRITICAL FOR PRODUCTION

**Syncs the production bundle into the server's `wwwroot`**

```bash
pnpm run build   # client build + poyo build + server build
```

**Why this is CRITICAL:**

In **development**, Vite serves assets directly:
```html
<!-- Dev mode - Vite dev server -->
<script type="module" src="http://localhost:5173/src/main.tsx"></script>
```

In **production**, Vite builds assets with hashed filenames:
```
dist/generated/
├── index-C2LBw7bc.css      ← Hash changes every build!
├── index-COWd0_qB.js        ← Hash changes every build!
└── vendor-SQrKxH4E.js       ← Hash changes every build!
```

**The Problem:**
Your Razor views need to reference these files, but the filenames change with every build!

**The Solution:**
`poyo build` reads Vite's manifest and generates `_ReactAssets.cshtml`:

```cshtml
<!-- Auto-generated - DO NOT EDIT -->
<link rel="stylesheet" href="/generated/index-C2LBw7bc.css" />
<script type="module" src="/generated/index-COWd0_qB.js"></script>
<script type="module" src="/generated/vendor-SQrKxH4E.js"></script>
<!-- Hashes updated automatically on every build! -->
```

**How it works:**
1. `pnpm run build` compiles React app
2. Vite creates `.vite/manifest.json` with file mappings
3. `poyo build` reads manifest
4. Generates `_ReactAssets.cshtml` with correct hashed filenames
5. `_Layout.cshtml` includes this partial in production
6. **Your app loads with correct assets!**

**What happens if you forget:**
```
❌ 404 errors - Assets not found
❌ Old cached assets loaded
❌ Broken production deployment
❌ White screen of death
```

**When it runs:**
- ✅ Automatically as part of `pnpm run build` (`client:build && poyo build && server:build`)
- ✅ Manually with `poyo build`

**Files involved:**
- Input: `poyo.client/dist/.vite/manifest.json` (Vite output)
- Output: `Poyo.Server/Views/Shared/_ReactAssets.cshtml` (Razor partial)
- Used by: `Poyo.Server/Views/Shared/_Layout.cshtml` (in production)

### 4. Route Management

**Add new route:**
```bash
pnpm run route:add User/Profile
# OR (with flags)
pnpm run route:add -- /Register --guest
```

**Route commands from the monorepo:**
```bash
# From the repo root (template development)
pnpm --filter poyo-template run route:add /User/Profile --guest
```
*   In a generated project, run `pnpm run route:add /User/Profile --guest` directly from the project root.


**What this command does:**
1.  **Updates `routes.json`**: Adds entry mapping `/User/Profile` to the React page and Razor view.
2.  **Scaffolds React Page**: Creates `poyo.client/src/pages/User/Profile/index.page.tsx`.
    *   *Optionally use `--flat` for `src/pages/User/profile.page.tsx` style.*
3.  **Scaffolds Razor View**: Creates `Poyo.Server/Views/User/Profile/Index.cshtml`.
    *   *Sets up the `#root` div with `data-page-name="User/Profile"` for hydration.*

**Remove route:**
```bash
pnpm run route:remove User/Profile
```
*   **Safe Deletion**: Prompts to optionally delete both the React page and MVC View (and empty folders).

**Sync routes:**
```bash
pnpm run route:sync
```
*   **Forward Sync**: Checks for missing files and offers Rescaffold/Prune.
*   **Reverse Sync**: Checks for "untracked" files (React pages not in `routes.json`) and offers to Add/Delete them.

---

## 📝 Scripts

### Client (`packages/poyo-template/poyo.client/`)
```bash
pnpm run dev              # Start dev server
pnpm run build            # Build for production
```

### Code Generation (from the template root)
```bash
pnpm run client:generate  # Generate TypeScript DTOs + Zod schemas from OpenAPI
```

### Route Management (Node)
```bash
pnpm run route:add        # Add new route
pnpm run route:remove     # Remove a route
pnpm run route:update     # Toggle route visibility
pnpm run route:sync       # Sync routes
```

### Server (`packages/poyo-template/Poyo.Server/`)
```bash
pnpm run dev              # Start server (dotnet run)
pnpm run build            # Build project (dotnet build)
pnpm run format           # Check C# formatting
pnpm run format:fix       # Fix C# formatting
pnpm run watch            # Watch mode (dotnet watch)
pnpm run publish          # Publish for production
```

---

## 🤝 Contributing

This is a starter framework - fork it and make it your own!

---

## 📄 License

MIT License - Use freely for any purpose

---

## 🎉 What Poyo Is NOT

- ❌ Not a full-featured CMS
- ❌ Not opinionated about database
- ❌ Not opinionated about authentication
- ❌ Not a replacement for Next.js/Remix (different architecture)

## ✅ What Poyo IS

- ✅ A minimal MPA starter
- ✅ A foundation to build upon
- ✅ A showcase of React + .NET integration
- ✅ A learning resource for MPA architecture

---

**Built with ❤️ for developers who want control over their stack**

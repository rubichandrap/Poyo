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
npm run build
  ↓
Vite compiles React → wwwroot/generated/index-[hash].js
  ↓
generate-manifest.js creates _ReactAssets.cshtml
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

```
Poyo/
├── Poyo.Server/              # .NET 10 Server
│   ├── Controllers/          # MVC + API Controllers
│   ├── Middleware/           # Auth, Error handling
│   ├── Models/               # DTOs
│   ├── Services/             # Business logic
│   └── Views/                # Razor views
│
└── poyo.client/              # React Client
    ├── src/
    │   ├── pages/            # React pages
    │   ├── hooks/            # Custom hooks (usePage, etc.)
    │   ├── hooks-api/        # TanStack Query hooks
    │   ├── services/         # API services
    │   └── providers/        # Context providers
    └── scripts/              # Code generation tools
```

---

## 🚀 Quick Start

### Prerequisites
- .NET 10 SDK
- Node.js 20+

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd Poyo

# Install client dependencies
cd poyo.client
npm install

# Run development servers
cd ../Poyo.Server
dotnet run  # Server on http://localhost:5104

# In another terminal
cd poyo.client
npm run dev  # Client on http://localhost:5173
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

<div id="root" data-page-name="Dashboard"></div>
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
    const data = usePage<DashboardData>();
    
    return (
        <div>
            <h1>{data?.message}</h1>
            <p>Server time: {data?.timestamp}</p>
            <p>User: {data?.user}</p>
            {/* Data is already here - no spinner, no API call! */}
        </div>
    );
}
```

**How it works:**
1. Server renders Razor view with data in `ViewBag.ServerData`
2. `_Layout.cshtml` injects it as `window.SERVER_DATA`
3. React hydrates and `usePage()` reads from `window.SERVER_DATA`
4. **Zero API calls** for initial page load!

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

### 2. Route Management

Routes are defined in `routes.json`:

```json
{
  "path": "/Dashboard",
  "name": "Dashboard",
  "files": {
    "react": "src/pages/Dashboard/index.page.tsx",
    "view": "Views/Dashboard/Index.cshtml"
  },
  "isPublic": false
}
```

Add new routes via CLI:
```bash
npm run route:add YourPage
```

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

```csharp
[GuestOnly]  // Redirects authenticated users
public IActionResult Login() => View();

[Authorize]  // Requires authentication
public IActionResult Dashboard() => View();
```

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
- Guest-only pages (`[GuestOnly]` attribute)
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

### 1. DTO Generation

**Generates TypeScript types from OpenAPI specification**

```bash
npm run generate:dtos
```

- Fetches OpenAPI spec from server
- Generates TypeScript types using `openapi-typescript`
- Outputs to `src/schemas/dtos.generated.ts`
- **Requires:** Server running + `VITE_OPENAPI_URL` in `.env`

### 2. Validation Schema Generation

**Generates Zod validation schemas from TypeScript DTOs**

```bash
npm run generate:schemas
```

- Reads generated DTOs
- Creates Zod schemas using `ts-to-zod`
- Outputs to `src/schemas/validations.generated.ts`
- Use in forms with `zodResolver`

### 3. Manifest Generation ⚠️ CRITICAL FOR PRODUCTION

**Generates production asset manifest for server-side rendering**

```bash
npm run generate:manifest
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
`generate-manifest.js` reads Vite's manifest and generates `_ReactAssets.cshtml`:

```cshtml
<!-- Auto-generated - DO NOT EDIT -->
<link rel="stylesheet" href="/generated/index-C2LBw7bc.css" />
<script type="module" src="/generated/index-COWd0_qB.js"></script>
<script type="module" src="/generated/vendor-SQrKxH4E.js"></script>
<!-- Hashes updated automatically on every build! -->
```

**How it works:**
1. `npm run build` compiles React app
2. Vite creates `.vite/manifest.json` with file mappings
3. `generate-manifest.js` reads manifest
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
- ✅ Automatically after `npm run build` (via postbuild script)
- ✅ Manually with `npm run generate:manifest`

**Files involved:**
- Input: `poyo.client/dist/.vite/manifest.json` (Vite output)
- Output: `Poyo.Server/Views/Shared/_ReactAssets.cshtml` (Razor partial)
- Used by: `Poyo.Server/Views/Shared/_Layout.cshtml` (in production)

### 4. Route Management

**Add new route:**
```bash
npm run route:add PageName
npm run route:add PageName --flat  # File-based naming
```

**Sync routes:**
```bash
npm run route:sync  # Interactive sync between routes.json and files
```

---

## 📝 Scripts

### Client (`poyo.client/`)
```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm run generate         # Generate DTOs + schemas
npm run generate:dtos    # Generate TypeScript types from OpenAPI
npm run generate:schemas # Generate Zod schemas from DTOs
npm run route:add        # Add new route (interactive)
npm run route:sync       # Sync routes with files
npm run lint             # Run linter
npm run format           # Check formatting
```

### Server (`Poyo.Server/`)
```bash
npm run dev              # Start server (dotnet run)
npm run build            # Build project (dotnet build)
npm run format           # Check C# formatting
npm run format:fix       # Fix C# formatting
npm run watch            # Watch mode (dotnet watch)
npm run publish          # Publish for production
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

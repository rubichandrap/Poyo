# Poyo.Server

**The .NET 10 ASP.NET Core Server for Poyo Framework**

This directory contains the backend application, serving as the core orchestrator for the Poyo framework. It handles server-side rendering, API endpoints, authentication, and data injection for the React client.

---

## 🏗️ Architecture

The server follows a clean separation of concerns, distinguishing between **View Controllers** (for HTML) and **API Controllers** (for Data).

```bash
Poyo.Server/
├── Controllers/
│   ├── Api/            # 🌐 RESTful API Controllers (JSON)
│   └── ...             # 📄 View Controllers (Razor/HTML)
├── Services/           # 🧠 Business Logic
├── Models/             # 📦 Data Transfer Objects (DTOs)
├── Middleware/         # 🛡️ Error Handling
└── Views/              # 🎨 Razor Views (.cshtml)
```

The routing framework itself (`RoutePolicy`, the access/SEO filters, `PageResult`, `PageController`, and the Page data helpers) is not in this tree — the project compiles it straight from the installed `@rubichandrap/poyo` package, so it shows up in your IDE under a `Framework` link and upgrades with `pnpm update @rubichandrap/poyo`.

### 1. View Controllers vs. API Controllers

| Feature | View Controllers | API Controllers |
| :--- | :--- | :--- |
| **Location** | `Controllers/` | `Controllers/Api/` |
| **Inherits** | `Controller` | `ControllerBase` |
| **Returns** | `IActionResult` (`ViewResult` or `PageResult`) | `ActionResult<T>` (JSON) |
| **Auth** | Redirects to Login | Returns 401 Unauthorized |
| **Purpose** | Serve HTML + Server Data | Handle AJAX/React Query requests |

### 2. Services Layer

All business logic resides in `Services/`. Controllers should remain thin and only orchestrate calls to services.

**Example:**
```csharp
// Program.cs
builder.Services.AddScoped<IAuthService, AuthService>();
```

---

## 🔑 Key Features

### 1. Registry Routing (`routes.json`)

Poyo uses a registry-driven routing system. Routes are defined in `routes.json` (at the template root, the parent of this folder), which is the source of truth — the csproj copies it beside the assembly so a published output carries it, and the server resolves it from there rather than from the process working directory. `RoutePolicy` — the single place the server interprets the registry — validates it at startup (failing loudly on malformed entries) and maps each route to a controller action. A registry that is missing, empty, unreadable, or unparseable fails startup by design: the access model, the SEO policy, and the no-store guarantee are all gated on it, so there is no safe way to boot without one. Set `Routes:JsonPath` to point at a different location.

- **Default routes**: Most pages are served by `PageController` with a single `Index` action; the view path comes from the registry.
- **Custom controller routes**: `controller`/`action` in the registry point a route at your own controller. Return `this.PoyoPage(data)` to join the framework's page result.
- **Access**: every route carries an `access` field (`public` | `guest` | `protected`, default `protected`), enforced universally by `RouteAccessFilter` — no per-action attributes.
- **SEO**: registry `seo` is applied to every route by `SeoPolicyFilter`, with the route name as the default title.
- **Dynamic navigation**: `PageResult` answers the JSON page descriptor (`{ name, seo, pageData }`) when a request carries `X-Poyo-Navigation: 1`, and the document otherwise; a route with `"dynamic": false` always answers the document.

**Adding a Route:**
```bash
# Run from the template ROOT directory
pnpm run route:add [FeatureName]
pnpm run route:add /Login --guest   # guest access (login/landing pages)
```

### 2. Authentication

The server uses **Cookie Authentication** by default.

- **`RouteAccessFilter`**: enforces the registry `access` model for every route — `protected` challenges anonymous users (pages redirect to the login path, API calls return 401), `guest` redirects authenticated users to the landing page, `public` is open.
- **`[Authorize]`**: standard ASP.NET Core attribute, available for additional control.
- **Middleware**: custom logic handles 401 redirects differently for API vs. View requests (API gets 401, Views get 302 to Login).

### 3. Controller-authored Page Data

Razor views are presentation-only. Controller actions own Page data and return it through `this.PoyoPage(data)`:

```csharp
public IActionResult Index()
{
    var data = new
    {
        userName = User.Identity?.Name,
        roles = User.Claims.Where(...)
    };

    return this.PoyoPage(data);
}
```

The shared layout imports `Poyo.Framework` and embeds the same structured value safely through `@Html.PoyoPageData()`, and dynamic navigation returns the same representation as descriptor `pageData` for that controller-produced value. A later request can produce fresh time-varying fields. `PoyoPage` accepts a JSON object or `null`; arrays and primitives are rejected.

### 4. React Integration (`_ReactAssets.cshtml`)

In **Production**, the server serves compiled assets from `wwwroot/generated`.
A manifest file (`_ReactAssets.cshtml`) is automatically generated during the build process to ensure the correct hashed filenames are processed by Razor.

---

## 🚀 Running the Server

### Prerequisites
- .NET 10 SDK
- Node.js 20+ (for client assets)

### Commands

| Command | Description |
| :--- | :--- |
| `dotnet run` | Starts the server (usually on port 5104). |
| `dotnet watch` | Starts the server with hot reload. |
| `pnpm run build` | Builds the client and server for production (run from root). |

### Configuration

The **process environment** is authoritative. The server reads the hosting environment from the process (`DOTNET_ENVIRONMENT`, else `ASPNETCORE_ENVIRONMENT`) before it looks at anything else, and the root `.env` file is only a development convenience: `Properties/launchSettings.json` names it via `EnvFile`, it is read only when the process says `Development` or says nothing, and it fills gaps without ever overriding a value the process already has set. An unset hosting environment is **Production**.

**Nothing is required in production.** `appsettings.json` ships the allowed-hosts value and is included in the publish output. Set production values on your host; the supported mechanisms are named in the project README's [Upgrading an existing deployment](../README.md#upgrading-an-existing-deployment). A `.env` left in a deployment is not read once the host names the environment, and it can never contribute the environment itself; note that an *unset* environment is production and does still read the file, so set it. Nothing environment-bearing is copied into publish output.

**Required in development only** — supplied by the launch profile, so `dotnet run` works on a fresh clone:
- `Vite__Server__AutoRun`, `Vite__Server__Port`, `Vite__Server__DevServerUrl`

A missing one fails startup immediately and names the variable. `Routes:JsonPath` is optional everywhere: it overrides where the Routes registry is resolved from, which otherwise is `routes.json` beside the application assembly.

> **Upgrading an existing deployment?** A value an operator added to a hand-edited production `.env` reverts the moment the file stops being read outside development — at exactly the moment they set the environment variable correctly, and *silently*, because the artifact carries its own registry and the deployment then enforces the access model of a different file. The full procedure is in the project README's [Upgrading an existing deployment](../README.md#upgrading-an-existing-deployment).

---

## ⚠️ Important Rules

1.  **NEVER return JSON from a View Controller.**
2.  **NEVER return HTML from an API Controller.**
3.  **Keep Controllers Thin**: Move logic to Services.
4.  **Use DTOs**: Never return Entity Framework entities directly to the client.

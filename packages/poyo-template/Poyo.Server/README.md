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
├── Routing/            # 🗺️ RoutePolicy + universal access/SEO filters
├── Services/           # 🧠 Business Logic
├── Models/             # 📦 Data Transfer Objects (DTOs)
├── Middleware/         # 🛡️ Error Handling
└── Views/              # 🎨 Razor Views (.cshtml)
```

### 1. View Controllers vs. API Controllers

| Feature | View Controllers | API Controllers |
| :--- | :--- | :--- |
| **Location** | `Controllers/` | `Controllers/Api/` |
| **Inherits** | `Controller` | `ControllerBase` |
| **Returns** | `IActionResult` (View) | `ActionResult<T>` (JSON) |
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

### 1. Hybrid Routing (`routes.json`)

Poyo uses a registry-driven routing system. Routes are defined in `routes.json` (at the template root, the parent of this folder). `RoutePolicy` — the single place the server interprets the registry — validates it at startup (failing loudly on malformed entries) and maps each route to a controller action.

- **Default routes**: Most pages are served by `PageController` with a single `Index` action; the view path comes from the registry.
- **Custom controller routes**: `controller`/`action` in the registry point a route at your own controller.
- **Access**: every route carries an `access` field (`public` | `guest` | `protected`, default `protected`), enforced universally by `RouteAccessFilter` — no per-action attributes.
- **SEO**: registry `seo` is applied to every route by `SeoPolicyFilter`, with the route name as the default title.

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

### 3. Server Data Injection

Data is injected into the client via `ViewBag.ServerData`.

```csharp
// In a Controller
ViewBag.ServerData = JsonSerializer.Serialize(new {
    userName = User.Identity.Name,
    roles = User.Claims.Where(...)
});
return View();
```

This data becomes immediately available to the React `usePage` hook.

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

### Configuration (`.env`)

The server reads environment variables from the root `.env` file.

**Required Variables:**
- `ASPNETCORE_ENVIRONMENT`: `Development` or `Production`
- `Vite__Server__DevServerUrl`: URL of the running Vite server (Dev only)

---

## ⚠️ Important Rules

1.  **NEVER return JSON from a View Controller.**
2.  **NEVER return HTML from an API Controller.**
3.  **Keep Controllers Thin**: Move logic to Services.
4.  **Use DTOs**: Never return Entity Framework entities directly to the client.

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
├── Middleware/         # 🛡️ Auth, Error Handling
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

Poyo uses a unique hybrid routing system. Routes are defined in `routes.json` (at the root of the repo) and are dynamically mapped to `PageController`.

- **Dynamic Routes**: Most pages use generic routing mapped to React pages.
- **Manual Routes**: You can still create standard MVC controllers (`Home`, `Login`) for specific needs.

**Adding a Route:**
```bash
# Run from ROOT directory
pnpm run route:add [FeatureName]
```

### 2. Authentication

The server uses **Cookie Authentication** by default.

- **`[GuestOnly]`**: Attributes for pages accessible only to unauthenticated users (e.g., Login).
- **`[Authorize]`**: Standard ASP.NET Core attribute for protected pages.
- **Middleware**: Custom logic handles 401 redirects differently for API vs. View requests (API gets 401, Views get 302 to Login).

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

# AI Coding Rules & Architectural Guidelines

This document serves as the **Constitution** for the Poyo framework. All AI agents and developers must adhere to these rules to ensure clarity, maintainability, and scalability.

---

## 1. Core Principles

### 1.1. Clean Code & Readability
- **Readability is King**: Code is read much more often than it is written
- **Self-Documenting Code**: Clear names over comments
- **SOLID Principles**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **DRY**: Don't Repeat Yourself (but don't over-abstract)

### 1.2. Architecture: Minimal MPA Framework
Poyo is intentionally minimal. It provides:
- Server-side routing with React hydration
- Basic authentication scaffold (to be replaced)
- Server data injection mechanism
- Type-safe API integration

**What Poyo Does NOT Provide:**
- Database layer (add your own)
- Production authentication (demo only)
- Business logic (framework only)
- UI component library (plain Tailwind)

---

## 2. Server Framework (.NET) Guidelines

### 2.1. Controller Strategy

**View Controllers (MVC)**
- **Location**: `Controllers/` (root)
- **Inheritance**: `Microsoft.AspNetCore.Mvc.Controller`
- **Purpose**: Serve Razor views (`.cshtml`)
- **Returns**: `IActionResult` with `View()`
- **Rule**: NEVER return JSON directly

**API Controllers**
- **Location**: `Controllers/Api/`
- **Inheritance**: `Microsoft.AspNetCore.Mvc.ControllerBase`
- **Attributes**: `[ApiController]`, `[Route("api/[controller]")]`
- **Purpose**: RESTful JSON APIs
- **Returns**: `ActionResult<T>` with JSend format

- **Returns**: `ActionResult<T>` with JSend format

**Custom Controllers**
- **Purpose**: Complex page logic, specialized data fetching, or custom view rendering.
- **Usage**: Map in `routes.json` via `"controller"` property.
- **CLI**: Use `npm run route:add ... --controller MyController` to generate.

### 2.2. SEO & Metadata
- **Configuration**: Managed in `routes.json` under `"seo"` object.
- **Do NOT**: Hardcode meta tags in views unless absolutely necessary.
- **Do**: Use `routes.json` for titles, descriptions, OG tags, and JSON-LD.

### 2.3. Middleware & Attributes

**Custom Attributes:**
- `[GuestOnly]` - Redirects authenticated users (for login/landing pages)
- `[ServerData]` - Injects data to `window.SERVER_DATA`
- `[Authorize]` - Requires authentication (built-in)

**Middleware:**
- `GlobalExceptionHandler` - Catches unhandled exceptions
- Cookie authentication - Simple demo auth

### 2.3. Models & DTOs

**Structure:**
```
Models/
├── Auth/
│   ├── Requests/      # LoginRequest, etc.
│   └── Responses/     # LoginResponse, etc.
└── [YourDomain]/
    ├── Requests/
    └── Responses/
```

**Rules:**
- Use record types for immutability when appropriate
- Keep DTOs simple (data only, no logic)
- Use `required` for mandatory properties

### 2.4. Services

**Location**: `Services/[Domain]/`

**Example:**
```csharp
public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request);
}

public class AuthService : IAuthService
{
    // Implementation
}
```

**Rules:**
- One service per domain
- Services orchestrate business logic
- Register in `Program.cs` as Scoped

---

## 3. Client Framework (React/TypeScript) Guidelines

### 3.1. Project Structure

```
src/
├── pages/              # React pages (one per route)
│   └── [PageName]/
│       └── index.page.tsx
├── hooks/              # Custom hooks
│   ├── use-page.ts     # Server data hook
│   └── index.ts
├── hooks-api/          # TanStack Query hooks
│   ├── auth/
│   └── index.ts
├── services/           # API services
│   └── auth.service.ts
├── providers/          # Context providers
│   ├── auth-provider.tsx
│   └── theme-provider.tsx
├── lib/                # Utilities
│   ├── http/           # HTTP client
│   └── react-query/    # Query client
└── routes/             # Route configuration
```

### 3.2. Pages

**Naming Convention**: `[PageName]/index.page.tsx`

**Example:**
```typescript
export default function DashboardPage() {
    const serverData = usePage<DashboardData>();
    
    return (
        <div>
            {/* Your page content */}
        </div>
    );
}
```

**Rules:**
- One default export per page
- Use plain HTML + Tailwind (no component library)
- Keep pages focused (extract logic to hooks)

### 3.3. Server Data Hook

**Usage:**
```typescript
// Server injects data via ViewBag.ServerData
const data = usePage<{ message: string }>();
```

**Type Safety:**
```typescript
interface DashboardData {
    message: string;
    timestamp: string;
    user: string;
}

const data = usePage<DashboardData>();
// data is typed!
```

### 3.4. API Integration

**TanStack Query Hooks:**
```typescript
// hooks-api/auth/use-login.ts
export function useLogin() {
    return useMutation({
        mutationFn: (data: LoginRequest) => authService.login(data),
    });
}

// Usage in component
const loginMutation = useLogin();
await loginMutation.mutateAsync({ username, password });
```

**Rules:**
- All API calls through TanStack Query
- One hook per API endpoint
- Export from `hooks-api/index.ts`

### 3.5. Forms & Validation

**React Hook Form + Zod:**
```typescript
const schema = z.object({
    username: z.string().min(1, "Required"),
    password: z.string().min(1, "Required"),
});

type FormData = z.infer<typeof schema>;

const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
});
```

**Rules:**
- Always use Zod for validation
- Define schema before component
- Use TypeScript inference (`z.infer`)

### 3.6. Styling

**Tailwind CSS Only:**
```typescript
<button className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">
    Submit
</button>
```

**Rules:**
- No UI component library (removed shadcn/ui)
- Use Tailwind utility classes directly
- Keep `index.css` minimal

---

## 4. Route Management

### 4.1. Route Definition

**File**: `routes.json`

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

### 4.2. Adding Routes

**CLI:**
```bash
npm run route:add YourPage
```

**Manual:**
1. Add entry to `routes.json`
2. Create `src/pages/YourPage/index.page.tsx`
3. Create `Views/YourPage/Index.cshtml`
4. Create controller if needed (or use CLI `--controller` flag)

### 4.3. SEO Configuration
- Add `"seo"` object to route in `routes.json`.
- Supports `title`, `description`, `meta` (dictionary), and `jsonld`.

---

## 5. Code Generation

### 5.1. DTOs from OpenAPI

```bash
npm run generate:dtos
```

Generates TypeScript types from `/openapi/v1.json`

### 5.2. Zod Schemas

```bash
npm run generate:schemas
```

Generates Zod validation schemas from DTOs

---

## 6. Authentication

### 6.1. Current Implementation

**Demo Only:**
- Hardcoded credentials (`demo`/`password`)
- Cookie-based sessions
- `[GuestOnly]` and `[Authorize]` attributes

### 6.2. Replacing Auth

**Replace `AuthService.cs`:**
```csharp
// Use ASP.NET Core Identity
// Or implement JWT
// Or integrate OAuth/OIDC
// Or your custom solution
```

**Update `Program.cs`:**
```csharp
// Remove demo auth registration
// Add your auth services
```

---

## 7. Best Practices

### 7.1. DO

✅ Keep the framework minimal
✅ Use TypeScript strictly
✅ Validate all inputs (server + client)
✅ Use TanStack Query for API calls
✅ Follow the folder structure
✅ Use JSend format for API responses
✅ Keep pages simple (extract logic)

### 7.2. DON'T

❌ Add business logic to the framework
❌ Use `any` type in TypeScript
❌ Bypass validation
❌ Make API calls without TanStack Query
❌ Add UI component libraries (keep it minimal)
❌ Mix MVC and API controller responsibilities

---

## 8. Deployment

### 8.1. Production Build

```bash
# Client
cd poyo.client
npm run build

# Server
cd Poyo.Server
dotnet publish -c Release
```

### 8.2. Environment Variables

**Required:**
- `ASPNETCORE_ENVIRONMENT`
- `Vite__Server__DevServerUrl` (dev only)

**Optional:**
- `ConnectionStrings__DB` (if using database)
- Add your own as needed

---

## 9. Framework Philosophy

**Poyo is:**
- A starting point, not a complete solution
- Minimal by design
- Flexible for your needs
- Educational for MPA architecture

**Poyo is NOT:**
- A full-featured framework
- Opinionated about database/auth
- A replacement for Next.js/Remix
- Production-ready out of the box

---

## 10. AI Agent Instructions

When working with Poyo:

1. **Understand the minimalism** - Don't add unnecessary features
2. **Respect the architecture** - MVC for views, API for data
3. **Keep it simple** - Plain HTML + Tailwind, no component libraries
4. **Type everything** - Use TypeScript strictly
5. **Document changes** - Update README/AGENTS.md when architecture changes
6. **Test your changes** - Ensure both server and client build

---

**Remember: Poyo is a foundation. Build what YOU need on top of it.**

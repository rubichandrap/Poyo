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
- Dynamic navigation: `useRouter()` and `<Link>` swap the page component below the loaded shell, with Back/Forward traversal and scroll restoration (ADR 0009)
- A framework-owned server core — route policy, access/SEO enforcement, and the page result — compiled in place from the installed framework package (ADR 0008)
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
- **Purpose**: Serve Razor views (`.cshtml`) and author Page data for registry pages.
- **Results**: `return View()` for a plain/non-registry view; `return this.PoyoPage(data)` for a registry page.
- **Rule**: NEVER return JSON directly.

**Page Data (framework contract)**
- Controllers are the sole Page data authors. Razor views never assign `ViewBag.ServerData` or otherwise supply Page data.
- `this.PoyoPage(data)` accepts a JSON object or `null`; arrays and primitives fail at the controller seam. Wrap non-object data in a top-level property.
- `_Layout.cshtml` embeds controller data with `@Html.PoyoPageData()`, never a raw `@Html.Raw` script. The helper emits nothing when data is absent and HTML-encodes `<`/`>` in the embedded script.
- Document `window.SERVER_DATA` and descriptor `pageData` are structurally equal for the same normalized Page data value, not necessarily byte-identical, because document embedding escapes HTML-sensitive characters. A later descriptor request runs the controller again, so time-varying fields can differ.
- Default `PageController.Index` routes have no Page data. Map a registry route to a custom controller when it needs data.

**API Controllers**
- **Location**: `Controllers/Api/`
- **Inheritance**: `Microsoft.AspNetCore.Mvc.ControllerBase`
- **Attributes**: `[ApiController]`, `[Route("api/[controller]")]`
- **Purpose**: RESTful JSON APIs
- **Returns**: `ActionResult<T>` with JSend format

**Registry Pages (framework)**
- **Served by**: `PageController.Index`, from the framework package's server core (`Poyo.Framework`), for every registry route without an explicit `controller`; these routes have no Page data.
- **Returns**: `PageResult` — the single result type for registry pages. It answers the document exactly as a plain `ViewResult` would, and answers the JSON page descriptor (`{ name, seo, pageData }`) when the request carries `X-Poyo-Navigation: 1`. For the same normalized controller-produced value, both representations carry the same structured `pageData`; separate requests can produce fresh time-varying fields.
- **Rule**: never hand-roll either representation; route custom pages through the framework result.

**Custom Controllers**
- **Purpose**: Complex page logic, specialized data fetching, Page data, or custom view rendering.
- **Usage**: Map in `routes.json` via `"controller"` and `"action"` properties.
- **CLI**: Use `pnpm run route:add ... --controller MyController` to generate.
- **Result**: `return this.PoyoPage(data)` (`ControllerExtensions`) joins the dynamic-navigation contract — view path, page name, and SEO resolve from the registry route for the request path, and `data` becomes `window.SERVER_DATA` on the document and the descriptor's `pageData` alike for that controller-produced value. A later request can produce fresh time-varying fields. For a path outside the registry the result degrades to a plain view render.

### 2.2. SEO & Metadata
- **Configuration**: Managed in `routes.json` under `"seo"` object.
- **Do NOT**: Hardcode meta tags in views unless absolutely necessary.
- **Do**: Use `routes.json` for titles, descriptions, OG tags, and JSON-LD.
- **Universal**: `SeoPolicyFilter` applies the registry `seo` to every registry route (default and custom controller routes alike); the route name is the default title when `seo` is absent.

### 2.3. Middleware, Filters & Attributes

**Registry-driven access (universal):**
- Every route's `access` field (`public` | `guest` | `protected`) is enforced by `RouteAccessFilter` — there are no per-action access attributes (`GuestOnlyAttribute` was removed; guest behavior folded into the registry policy).
- `protected` + anonymous → challenge (cookie config keeps the LoginPath redirect for pages and 401 for API calls)
- `guest` + authenticated → redirect to the configured landing page (`Routes:LandingPath`, default `/Dashboard`)
- `public` → open to everyone
- Applies to custom-controller routes exactly like default ones.

**Attributes:**
- Page data has no attribute path; controller actions return `this.PoyoPage(data)`.
- `[Authorize]` - Requires authentication (built-in). Registry access remains the universal page policy.

**Guest Routes:**
- Use CLI: `pnpm run route:add -- /Register --guest`
- Writes `access: "guest"` in the registry; no controller change needed (maps to `PageController.Index`)

**Middleware & Filters:**
- `RouteAccessFilter` - Universal access enforcement from the registry (see above). Runs before the page result executes, so a protected route's descriptor request challenges (redirect/401) instead of leaking `pageData`.
- `SeoPolicyFilter` - Universal SEO application from the registry (see §2.2)
- `GlobalExceptionHandler` - Catches unhandled exceptions (app-side, stays in the project)
- Cookie authentication - Simple demo auth

**Dynamic navigation (wire contract):**
- A request carrying `X-Poyo-Navigation: 1` asks for the page descriptor (`{ name, seo, pageData }` JSON) instead of the document. `PageResult` answers both representations and sets `Vary: X-Poyo-Navigation`, so caches key on the distinguishing header.
- The header literal and the descriptor shape are wire contract — changes must stay backward-compatible or ship with a CLI release note.

### 2.4. Models & DTOs

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

### 2.5. Services

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

### 2.6. Server Core (framework package)

The framework-owned server code — `RoutePolicy`, `RouteDefinition`, the access/SEO filters, `PageResult`, `PageController`, the controller extension, the `@Html.PoyoPageData()` helper, and the `AddPoyo()`/`MapPoyoRoutes()` registration extensions — ships as readable source inside the framework package (`node_modules/@rubichandrap/poyo/server/`, namespace `Poyo.Framework`) and is never copied into a project tree (ADR 0008).

- The server csproj compiles it in place: `Compile Include="../node_modules/@rubichandrap/poyo/server/**/*.cs" LinkBase="Framework"`, plus the defensive `Compile Remove="node_modules/**/*.cs"`. The files open in the IDE under a `Framework` link. Rename-safety is by construction for everything under `node_modules` — the scaffolder's rename pass never rewrites the installed package; the framework identifiers the template's own files call (`Poyo.Framework`, `AddPoyo`, `MapPoyoRoutes`, `PoyoPage`, the `X-Poyo-Navigation` literal) survive the rename through the scaffolder's sentinel protection.
- An `Exists` guard fails the build with "run `pnpm install`" when the package is missing — the one failure mode of the in-place design is an instruction, not a mystery.
- `Program.cs` wires the core with `builder.Services.AddPoyo(builder.Configuration, routesJsonPath)` (loads and validates the registry eagerly, installs both filters) and `app.MapPoyoRoutes()` after `app.MapControllers()`. Keep that wiring; the project's own server code is controllers, services, models, views, and `GlobalExceptionHandler`.
- Upgrade path: `pnpm update @rubichandrap/poyo` — server-side framework fixes arrive with the CLI and runtime, no scaffold or copy step. Never edit the installed files; they are read-only teaching material.

---

## 3. Client Framework (React/TypeScript) Guidelines

### 3.1. Project Structure

```
src/
├── pages/              # React pages (one per route)
│   └── [PageName]/
│       └── index.page.tsx
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

**Source**: `usePage` ships from the framework package — `@rubichandrap/poyo/runtime` — not from the project. The package also declares `Window.SERVER_DATA?: unknown` globally. Controllers supply Page data through `this.PoyoPage(data)`, and `_Layout.cshtml` embeds it through `@Html.PoyoPageData()` into `window.SERVER_DATA`. The accessor reads the runtime's navigation store: that initial value seeds it, and every dynamic navigation commits the descriptor's `pageData` to it (§3.7); the representation is structurally equal for the same normalized value, while a later controller invocation may produce fresh time-varying fields.

**Usage:**
```typescript
// Server injects data via this.PoyoPage(data)
import { usePage } from "@rubichandrap/poyo/runtime";

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

### 3.7. Route Resolution

**Source**: route resolution ships from the framework package — `createRouteTable` from `@rubichandrap/poyo/runtime` (ADR 0006). The generated project keeps only a thin Vite-boundary adapter, `src/routes/route-loader.ts`: it globs `src/pages/**/*.page.tsx`, resolves the base path (server-injected `data-base-path` on the mount root or `<body>`; `VITE_BASE_URL` is the standalone-dev fallback), calls `createRouteTable` with `routes.json`, and re-exports the legacy surface (`routes`, `routeMap`, `findRouteByName`, `findRouteGeneric`, `AppRoute`) so existing imports don't churn.

**Typed manifest**: `poyo generate` emits `routes.generated.ts` at the client package root (ADR 0010) — an ambient module augmentation of `PoyoRouteRegistry` inside `@rubichandrap/poyo/runtime`. The runtime derives `RouteName`/`RoutePath` (falling back to `string` pre-augmentation) and exports the typed `routePath(name)` helper. The file is gitignored, imported by no one, and kept fresh by every `poyo route` command and `poyo generate`; `routes.json` stays the only edited source of truth.

**Lookups** return `AppRoute` (canonical path, page name, `access` defaulting to `protected`, lazy component), never a bare component. A registry entry pointing at a missing page file warns and skips only that route; an unknown server-declared page name reports through `onError` in dev and renders "Page not found". The runtime's `resolveInitialRoute` binds the server-declared page name (`data-page-name`) first, with `findRouteGeneric(window.location.pathname)` as the standalone-dev fallback; `app.tsx` only renders the route `useRouter()` hands it.

**Navigation subpaths**: dynamic navigation is explicit-only — no global interception, so a plain `<a>` stays a document load. `Link` ships from `@rubichandrap/poyo/runtime/link` (declarative) and `useRouter`/`createRouter` from `@rubichandrap/poyo/runtime/router` (programmatic) — the `next/link` / `next/router` split; the runtime root re-exports both. `Link`'s one opt-out is the documented `data-dynamic-nav="off"` attribute.

One navigation path: descriptor fetch (`X-Poyo-Navigation: 1`, §2.3) → top-level shape check → route-table lookup by page name → store commit (route + page data) → history write (`pushState`/`replaceState`) → SEO apply, focus move, live-region announcement. Traversal rides the `popstate` path only: Back/Forward after a client-side navigation swap pages the same way, with the scroll position stored per history entry and restored on return; a cold entry (a URL the client never navigated to) is an ordinary document load, and a hash-only change never enters the machinery. Any failure — non-2xx, non-descriptor body, unknown page name, apply error — degrades to a document load of the same URL; the browser's own navigation is the floor, not the fallback. Rapid successive pushes are last-write-wins (a supersede token drops stale responses).
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
  "access": "protected",
  "dynamic": true,
  "seo": {
    "title": "Dashboard",
    "description": "View your stats"
  }
}
```

`access` is one of `public` | `guest` | `protected` (default `protected`). Legacy `isPublic`/`isGuestOnly` flags are rejected as unknown fields — there is no migration shim.

`dynamic` is an optional boolean (default `true`). Setting `"dynamic": false` opts the route out of dynamic navigation: the server answers the document even when a request carries the navigation header, and the client never swaps it in (§3.7). There is no CLI flag for it — edit the registry by hand; the CLI validates the field on every read (`junk` values fail with the route named) and round-trips it untouched. Boot validation rejects malformed values the same way.

The client consumes the registry through the runtime route table: `src/routes/route-loader.ts` imports `routes.json` directly, while `poyo generate` emits `<client>/routes.generated.ts` (ambient type augmentation — `RouteName`/`RoutePath` unions, see §3.7), gitignored and kept fresh by every route command, so `routes.json` stays the only edited source of truth.

### 4.2. Adding Routes

**CLI** (run from `packages/poyo-template/`, or from the repo root via `pnpm --filter poyo-template run`):
```bash
pnpm run route:add YourPage
```

**Manual:**
1. Add entry to `routes.json`
2. Create `src/pages/YourPage/index.page.tsx`
3. Create `Views/YourPage/Index.cshtml`
4. Create controller if needed (or use CLI `--controller` flag)

### 4.3. Removing Routes

**CLI** (run from `packages/poyo-template/`, or from the repo root via `pnpm --filter poyo-template run`):
```bash
pnpm run route:remove YourPage
```
*   **Behavior**: Will prompt to delete the React page and View file. You can answer 'y' to clean up everything.

### 4.4. Syncing Routes

**CLI** (run from `packages/poyo-template/`, or from the repo root via `pnpm --filter poyo-template run`):
```bash
pnpm run route:sync
```
*   **Forward Sync**: Fixes missing files (offers to `Rescaffold`).
*   **Reverse Sync**: Detects untracked files (React pages not in `routes.json`) and offers to `Add` them. Useful if you manually created a file and forgot to register the route.

### 4.5. SEO Configuration
- Add `"seo"` object to route in `routes.json`.
- Supports `title`, `description`, `meta` (dictionary), and `jsonld`.
- `SeoPolicyFilter` applies it to every registry route; without `seo`, the route name becomes the title.

---

## 5. Code Generation

### 5.1. DTOs + Zod Schemas from OpenAPI

```bash
pnpm --filter poyo-template run client:generate
```

Generates TypeScript DTOs from the server OpenAPI document (via `openapi-typescript`) and Zod validation schemas from those DTOs (via `openapi-zod-client`). By default, reads the committed OpenAPI snapshot at `openapi/openapi.json` offline without requiring a running server; pass a custom local file as an argument (`poyo generate ./custom.json`) to override. `Poyo.Server` exports fresh snapshots directly to `openapi/openapi.json` on boot in Development/Staging environments. `poyo generate` also emits the typed route manifest at the client root (`routes.generated.ts`, §3.7).

### 5.2. Client Build Sync

```bash
pnpm --filter poyo-template run build
```

`poyo build` reads the Vite manifest, copies active assets into `wwwroot/generated`, prunes stale files, and rewrites `_ReactAssets.cshtml` with the current entry JS/CSS. The client ships no `index.html` — the Razor views own every document and the Vite build entry is the client module (`src/main.tsx`) — so only manifest-referenced assets ever reach `wwwroot`.

---

## 6. Authentication

### 6.1. Current Implementation

**Demo Only:**
- Hardcoded credentials (`demo`/`password`)
- Cookie-based sessions
- Access enforced by the registry (`access` field via `RouteAccessFilter`), plus `[Authorize]` where needed

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
❌ Use `any` type in TypeScript — one deliberate exception: the client runtime's `PageLoader`/`AppRoute` use `ComponentType<any>` because page props are unknown and vary per page and React's `lazy()` requires it; each use is marked with a `biome-ignore` comment.
❌ Bypass validation
❌ Make API calls without TanStack Query
❌ Add UI component libraries (keep it minimal)
❌ Mix MVC and API controller responsibilities

---

## 8. Deployment

### 8.1. Production Build

```bash
# Client
cd packages/poyo-template/poyo.client
pnpm run build

# Server
cd packages/poyo-template/Poyo.Server
dotnet publish -c Release
```

### 8.2. Environment Variables

**Required:**
- `ASPNETCORE_ENVIRONMENT`
- `Vite__Server__DevServerUrl` (dev only)

**Optional:**
- `ConnectionStrings__DB` (if using database)
- Add your own as needed

### 8.3. Publishing the Three Packages (lockstep)

All three packages share one version and are published together from a git tag.

1. **Bump the version** in all three `package.json` files (`packages/poyo-template`, `packages/poyo`, `packages/create-poyo-app`) to the same value.
2. **Add a changelog entry** for the new version in the root `CHANGELOG.md` and each package's `CHANGELOG.md` (Keep a Changelog format).
3. **Verify** with `pnpm run release:check` (zero-arg lockstep check) or `node scripts/assert-release-version.mjs <version>`.
4. **Ensure every package has a `README.md`** in its own directory (`packages/<pkg>/README.md`). npm renders the readme from the package directory — a missing file publishes an empty readme. The release workflow fails the build if any package lacks one. `poyo-template`'s README doubles as the README of every generated project (the scaffolder copies it wholesale), so keep it rename-safe: `Poyo`/`Poyo.Server`/`poyo.client` tokens are rewritten to the project name.
5. **Cut a tag** `v<version>` and push it. `.github/workflows/release.yml` runs: install, `tsc` build, asserts versions match the tag, fails if the version is already on npm, then publishes all three via `pnpm publish` with `NPM_TOKEN` (a classic npm token secret — required because npm Trusted Publishing/OIDC cannot create brand-new packages), then creates a GitHub Release from the root `CHANGELOG.md` entry.
6. **Run release verification in two phases.** Before publishing, run the workspace-local unit, integration, and scaffolder gates; they must be green but do not prove npm resolution:

   ```bash
   pnpm --filter @rubichandrap/poyo run test
   pnpm --filter @rubichandrap/create-poyo-app run test
   dotnet test packages/poyo-template/Poyo.Server.Tests/Poyo.Server.Tests.csproj
   node --test scripts/assert-release-version.test.mjs
   pnpm run release:check
   ```

   After the workflow publishes all three packages, run `pnpm run test:release`. It combines the lockstep unit tests with the npm-backed fixture e2e and is the release acceptance gate.

7. **Treat the fixture as post-publish evidence.** `scripts/fixture-e2e.test.mjs` scaffolds a real project, installs `@rubichandrap/poyo` at the release version from npm, and verifies the published runtime/server shape, generated-project rename, build, served document, and navigation descriptor — including representation parity for stable fields between document `window.SERVER_DATA` and descriptor `pageData`; controller-generated timestamps can differ between requests. It is intentionally red until that version is published. A pre-publish run may confirm the `[RED-UNTIL-PUBLISHED]` diagnostic, but only a post-publish green fixture completes the release gate.

---

## 9. Framework Philosophy

**Poyo is:**
- A minimal MPA foundation, not a complete turnkey product
- Minimal by design. It provides the MPA skeleton; you add auth, database, and business logic
- Flexible for your needs
- A clean reference for server/client-separated React + .NET architecture

**Poyo is NOT:**
- A full-featured framework
- Opinionated about database/auth
- A replacement for Next.js/Remix

**Related: JsxCore.** If a user wants React as an ASP.NET view engine (one build, no Node in production, view types generated from C#), point them to [JsxCore](https://github.com/davidwhitney/JsxCore). Poyo takes the opposite stance. The React client is fully decoupled from the server and only ships HTML plus `window.SERVER_DATA`. See the "Poyo vs JsxCore" section in the README for the full comparison.

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

## 11. Git & Commits

### 11.1. Conventional Commits

All commits MUST follow Conventional Commits:

- **Format**: `<type>(<scope>): <subject>` — scope optional
- **Types**: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- **Subject**: imperative mood ("add", "fix", "remove"), ≤72 chars, no trailing period
- **Body**: only for non-obvious "why", breaking changes (`BREAKING CHANGE:`), or linked issues
- **Reference issues**: `Closes #<n>`, `Refs #<n>`

### 11.2. Branch Policy

Never commit or push directly to `main`. Always:

1. Create a feature branch: `git checkout -b <type>/<short-description>`
2. Commit on that branch (Conventional Commits, see above)
3. Push the branch and open a pull request into `main`

Merging to `main` happens via PR (and ideally a review).

---

## Agent skills

### Issue tracker

GitHub Issues are authoritative; local `.scratch/<feature>/` files hold specs, plans, and research. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

---

**Remember: Poyo is a foundation. Build what YOU need on top of it.**

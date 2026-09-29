# Poyo

Poyo is a React + .NET 10 Multi-Page Application framework. It connects an ASP.NET Core MVC document layer to a Vite React client through a route registry, controller-authored Page data, framework-owned server policy, and explicit client navigation.

Poyo provides the boundary between the .NET server and the React client, plus the project tooling needed to run and build that boundary.

## Quick start

Prerequisites: .NET 10 SDK, Node.js 20+, and pnpm.

```bash
npx @rubichandrap/create-poyo-app@latest MyApp
cd MyApp
pnpm run restore
pnpm run generate
pnpm run dev
```

`pnpm run dev` starts the .NET watch server and the Vite development server. See `packages/poyo-template/README.md` for the generated project's scripts and layout.

## How a page works

1. `routes.json` maps a URL to a React page and a Razor view.
2. A controller action returns `this.PoyoPage(data)` when the page needs server data.
3. The Razor view renders the React mount point and calls `@Html.PoyoPageData()`.
4. Vite builds the client and the server serves the generated assets.

### Page data

Controllers are the only Page data authors. Views do not serialize data.

```csharp
public IActionResult Index()
{
    var data = new
    {
        message = "Hello from the server"
    };

    return this.PoyoPage(data);
}
```

Map the route to that action in `routes.json`:

```json
{
  "path": "/Dashboard",
  "name": "Dashboard",
  "files": {
    "react": "src/pages/Dashboard/index.page.tsx",
    "view": "Views/Dashboard/Index.cshtml"
  },
  "access": "protected",
  "controller": "Dashboard",
  "action": "Index"
}
```

The shared layout imports the framework namespace and embeds the value:

```cshtml
@using Poyo.Framework
@Html.PoyoPageData()
```

The client reads it through the framework runtime:

```tsx
import { usePage } from "@rubichandrap/poyo/runtime";

interface DashboardData {
  message: string;
}

export default function DashboardPage() {
  const data = usePage<DashboardData>();
  return <h1>{data?.message ?? "No data"}</h1>;
}
```

`PoyoPage` accepts a JSON object or `null`; arrays and primitives are rejected. Wrap non-object values in a property such as `{ items = values }`. For the same normalized controller-produced value, document and navigation-descriptor Page data have the same structure. A later descriptor request runs the controller again, so time-varying fields can differ.

## Routes

`routes.json` is the source of truth for route existence:

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
  "controller": "Dashboard",
  "action": "Index",
  "seo": {
    "title": "Dashboard",
    "description": "View your dashboard"
  }
}
```

- `access` is `public`, `guest`, or `protected`; the server applies it to registry routes, including custom-controller routes.
- `dynamic` defaults to `true`. Set it to `false` for a document-only route.
- `controller` and `action` select a custom server action.
- `seo` supplies title, description, meta tags, and JSON-LD to the document and descriptor.

The client route loader is a thin Vite adapter. Route resolution, typed route names, and `routePath()` come from `@rubichandrap/poyo/runtime`.

The registry is also a required deployment artifact: the access model, the SEO policy, and the private no-store guarantee are all gated on it, so an application whose registry is missing, empty, unreadable, or unparseable refuses to start. It resolves from `Routes:JsonPath` (a relative value against the content root), then from `routes.json` beside the application assembly — the server build copies the project-root registry there, so a published output is self-contained — The default never consults the process working directory; an explicitly configured *relative* path is resolved against the content root, which the host chooses (and which in ASP.NET defaults to the working directory). See [ADR 0014](docs/adr/0014-routes-registry-is-a-required-deployment-artifact.md).

A route's identity is one thing, defined once, and enforced in two disciplines: the authored file is held to a canonical form, and the incoming request is normalized rather than rejected. A declared `path` must begin with `/` and carry no trailing slash except for the root; a `name` must be present and carry no leading or trailing slash; both must be unique across the registry ignoring case; and `controller` and `action` are declared together or not at all, neither blank. Each of those is a startup failure naming the route and the value — the `poyo` route manager refuses the same registries when it reads or writes them. In the browser it stays forgiving: `/login`, `/Login` and `/Login/` all serve the declared `/Login`. See [ADR 0015](docs/adr/0015-route-identity-is-canonical.md).

Because those rules are written twice — once in C# and once in TypeScript — the two runtimes read a shared **registry corpus**, one file per rule and the verdict it earns, and are held to the same answers. A rule lands with its case, and then one that reaches a single runtime fails a test rather than a deployment. Every field has exactly one accepted spelling, so a mis-cased member is an unknown member and the server names the offending route. See [ADR 0018](docs/adr/0018-registry-corpus-and-one-field-spelling.md).

The process environment is authoritative, and `.env` is a **development** convenience that **never travels with the artifact** — nothing environment-bearing is copied into publish output. The hosting environment is read from the process before the file is considered, so the file can never decide the environment it is conditional on; the file is read only when the process says development or says nothing, and it fills gaps without ever overriding a value the process has set. An unset hosting environment is production. The development-only Vite variables are required only in development. A `.env` left in a deployment cannot contribute the hosting environment under either name, and is not read at all once the host names the environment; note that an *unset* environment is production and still reads the file, so set it. Set production values on your host: a service manager `EnvironmentFile=`, `docker run --env-file`, IIS `web.config` `environmentVariables`, or an `appsettings.Production.json`. See [ADR 0017](docs/adr/0017-process-environment-owns-hosting-environment.md).

> **Upgrading an existing deployment?** Values an operator added to a hand-edited production `.env` are authoritative today *only because* the loader overrode the process, so the moment the file stops being read outside development they revert — at exactly the moment you set the environment variable correctly and believe the deployment is tightened. Inventory the production `.env`, diff it against `.env.example`, and move every key the example does not have to your host, in the same change that sets `ASPNETCORE_ENVIRONMENT=Production`. `Routes:JsonPath` is the one to check twice: its loss is a security regression, and the loss is **silent** — the published artifact carries its own copy of the registry beside the application, so the deployment still boots and still enforces, the access model of a *different* file. **A green boot is not evidence the migration is complete.** The full procedure is in the template's [README](packages/poyo-template/README.md#upgrading-an-existing-deployment), which ships as the README of every generated project.

Manage routes with the project CLI:

```bash
pnpm run route:add User/Profile
pnpm run route:add /Register --guest
pnpm run route:remove User/Profile
pnpm run route:sync
```

For the complete command reference, read `packages/poyo/README.md`.

## Dynamic navigation

Dynamic navigation replaces the page component below the loaded document shell. It is explicit; a plain `<a>` remains a document navigation.

```tsx
import { Link } from "@rubichandrap/poyo/runtime/link";
import { useRouter } from "@rubichandrap/poyo/runtime/router";
import { routePath } from "@rubichandrap/poyo/runtime";

<Link href={routePath("Dashboard")}>Dashboard</Link>;

const router = useRouter();
await router.push(routePath("Login"));
```

The client requests `{ name, seo, pageData }` with `X-Poyo-Navigation: 1`, commits the destination route and Page data, updates history and SEO, then announces the swap. Back and Forward restore page and scroll state. Any navigation failure falls back to a document load of the same URL. Descriptor fetches explicitly use `credentials: "same-origin"`, so the current HTTP-only cookie is included for same-origin page requests but never for cross-origin requests.

The server applies route access before it answers a descriptor request. A route with `"dynamic": false` always answers the document.

## Build and code generation

`pnpm run generate` reads the committed OpenAPI snapshot and writes:

- TypeScript DTOs from `openapi-typescript`
- Zod schemas from `openapi-zod-client`
- the gitignored typed route manifest

The default snapshot is `poyo.client/openapi/openapi.json`, so generation works without a running server. A local file can be supplied when needed:

```bash
pnpm run generate
poyo generate ./custom-openapi.json
```

`pnpm run build` runs the client build, syncs manifest-referenced assets into `Poyo.Server/wwwroot/generated`, rewrites `_ReactAssets.cshtml`, and builds the server. The generated views reference the current hashed asset names.

## Repository layout

```text
Poyo/
├── packages/
│   ├── poyo-template/       # generated-project template
│   │   ├── Poyo.Server/     # ASP.NET Core MVC server
│   │   ├── poyo.client/     # Vite React client
│   │   └── routes.json      # route registry
│   ├── poyo/                # CLI, client runtime, and C# server core
│   └── create-poyo-app/     # project scaffolder
├── scripts/                 # release and fixture tooling
└── .github/workflows/       # CI and package release workflows
```

The server core is not copied into a generated project. Its csproj compiles the source shipped in `@rubichandrap/poyo/server`, where it remains readable under the `Framework` link. A missing package fails the build with an instruction to run `pnpm install`.

## Package guides

- `packages/poyo/README.md` — CLI, runtime, route resolution, navigation, and server-core API
- `packages/poyo-template/README.md` — generated-project structure and usage
- `packages/create-poyo-app/README.md` — scaffolder options and generated-project contents

## Poyo vs JsxCore

[JsxCore](https://github.com/davidwhitney/JsxCore) is a different execution model: React or Preact renders in-process on the server and in the browser. It keeps the view, component, and .NET model in one server-side rendering pipeline.

Poyo keeps the React client as a separate Vite project. The .NET server produces the document and Page data; React hydrates in the browser. This makes the client/server boundary explicit and lets the client use the React/Vite toolchain independently.

| | Poyo | JsxCore |
|---|---|---|
| React execution | Browser hydration | Server rendering and browser hydration |
| Build tools | Vite + .NET | .NET |
| Component model | React client components | Server-rendered React/Preact views |
| C# to client types | OpenAPI generation | Generated view-model types |
| .NET access | MVC actions, APIs, and `window.SERVER_DATA` | Direct server-side interop |
| Best fit | A separate React client with an explicit server boundary | One .NET-centric rendering pipeline |

Choose JsxCore when server-side React rendering and one .NET build are the priority. Choose Poyo when the React client should remain a normal Vite application and the server should own documents, routing, and Page data.

## License

MIT

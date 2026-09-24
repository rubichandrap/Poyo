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

The client requests `{ name, seo, pageData }` with `X-Poyo-Navigation: 1`, commits the destination route and Page data, updates history and SEO, then announces the swap. Back and Forward restore page and scroll state. Any navigation failure falls back to a document load of the same URL.

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

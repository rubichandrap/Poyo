# Poyo

A minimal React + .NET MPA starter framework. Distributed as a monorepo of tooling packages that generate and maintain standalone Poyo projects.

## Language

**Access**:
A route's access model in the Routes registry. One of `public` (anyone, authenticated or not), `guest` (reachable only when logged out; authenticated users are redirected away — implies public access), or `protected` (requires authentication, the default). A single field replaces the legacy `isPublic`/`isGuestOnly` flags.
_Avoid_: visibility, access policy, auth level

**Scaffolder**:
The tool (`create-poyo-app`) that creates a new Poyo project from the template.
_Avoid_: CLI, generator, create tool

**Template**:
The clean project skeleton (React client, .NET server, routes registry) with zero tooling. Developed live as a workspace package, copied wholesale into generated projects.
_Avoid_: starter, boilerplate, template files

**Framework package**:
The `poyo` package installed into generated projects — the CLI (route management, build glue, and OpenAPI-to-TypeScript codegen) plus the client runtime (`@rubichandrap/poyo/runtime`, the `usePage` accessor). The analogue of `next` in a Next.js project.
_Avoid_: CLI tool, devtool, poyo binary

**Route**:
A single entry in the Routes registry: a URL path, a name, the React page and server view files, an access model, optional SEO, and optional explicit controller/action for custom controllers.
_Avoid_: page, endpoint, page definition

**Route manager**:
The part of the framework package's CLI that mutates the routes registry and scaffolds the page, view, and controller files for a route.
_Avoid_: route generator, route script

**Route policy**:
The server's translation of a Route into an ASP.NET route mapping — which controller action serves it, which access rules apply, and how its SEO is applied. The single place the server interprets the Routes registry; it fails startup loudly when the registry violates the route schema.
_Avoid_: route mapper, route interpreter, dynamic routing

**Generated project**:
A standalone project produced by the scaffolder: the template plus the framework package as a dev dependency.
_Avoid_: consumer, target app, scaffolded app

**Page data**:
The per-page payload the server injects for React pages: `ViewBag.ServerData` serialized with System.Text.Json into `window.SERVER_DATA` by the layout, read once per page load by `usePage` from the framework package's runtime. A one-shot bootstrap channel — fresh data flows through the API path.
_Avoid_: server state, props injection, hydration data

**Routes registry**:
The `routes.json` file that maps URL paths to their React page and server view files. The single source of truth for route existence.
_Avoid_: route map, route config

**Route table**:
The client runtime's per-load binding produced by `createRouteTable` from the framework package (`@rubichandrap/poyo/runtime`): the registry mapped to lazy components plus name/path lookups. Derived from the registry, never the source of truth.
_Avoid_: routes registry

**Route loader**:
The thin Vite-boundary adapter in generated projects (`src/routes/route-loader.ts`): globs the page files, resolves the base path, calls `createRouteTable`, and re-exports its API.
_Avoid_: route engine, route resolver

**Project identity**:
The facts the package's CLI derives from a generated project rather than assuming from the template — the server namespace and the client/server directory names. Scaffolding renames the project, so tooling that hardcodes the template's names breaks in generated projects.
_Avoid_: project name, namespace config

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
The `poyo` package installed into generated projects — the CLI (route management, build glue, and OpenAPI-to-TypeScript codegen), the client runtime (`@rubichandrap/poyo/runtime`, the `usePage` accessor), and the Server core source it carries. The analogue of `next` in a Next.js project.
_Avoid_: CLI tool, devtool, poyo binary

**Route**:
A single entry in the Routes registry: a URL path, a name, the React page and server view files, an access model, optional SEO, an optional explicit controller/action for custom controllers, and an optional dynamic-navigation opt-out.
_Avoid_: page, endpoint, page definition

**Route manager**:
The part of the framework package's CLI that mutates the routes registry and scaffolds the page, view, and controller files for a route.
_Avoid_: route generator, route script

**Route identity**:
What makes a route referable: a canonical declared path (rooted, no trailing slash except for the root, unique ignoring case), a canonical name (present, with no leading or trailing slash, unique ignoring case), and a controller and action declared together or not at all. Enforced in two disciplines with one definition — the authored registry is strict and fails the boot, the incoming request is normalized and resolved. A request URL is owned by the browser; a declaration is not.
_Avoid_: route validation, canonical routes, path cleanup

**Registry corpus**:
The set of registries at `fixtures/registry/`, one file per registry rule with the verdict it earns, read by both the server's and the route manager's suites. Makes the two runtimes' agreement falsifiable: a rule added to one and not the other fails a test. A case declaring one verdict for the two also pins the message fragments both carry; a case declaring a verdict per runtime pins a deliberate difference. Lives at the repository root because it belongs to neither package.
_Avoid_: registry fixtures, shared fixtures, contract tests

**Route policy**:
The server's translation of a Route into an ASP.NET route mapping — which controller action serves it, which access rules apply, and how its SEO is applied. The single place the server interprets the Routes registry; it fails startup loudly when the registry violates the route schema or a route's identity is not canonical.
_Avoid_: route mapper, route interpreter, dynamic routing

**Route schema**:
The server's half of the registry's shape, checked on the raw JSON before deserialization: the one accepted spelling of every field name, the members a route must carry, and the two values whose type is part of the contract (`access`, `dynamic`). Each is a failure the deserializer either cannot report usefully or does not fail at all, and each is reported here where the offending route can be named.
_Avoid_: registry schema, deserialization options, JSON validation

**Request resolution**:
How a request finds its Route: one lookup, by normalized request path, answering "which route serves this request" for the access filter, the SEO filter, the page controller and the controller extension alike. A path the registry does not own resolves to no route, and routing answers it with a clean 404. A page therefore has exactly one URL — the path its registry entry declares.
_Avoid_: route resolution, route matching, controller/action resolution

**Generated project**:
A standalone project produced by the scaffolder: the template plus the framework package as a dev dependency.
_Avoid_: consumer, target app, scaffolded app

**Page data**:
The optional JSON object a controller supplies for a React route, embedded in the document and dynamic navigation descriptor. Read by `usePage` on initial load and refreshed on dynamic navigation.
_Avoid_: server state, props injection, hydration data

**Routes registry**:
The `routes.json` file that maps URL paths to their React page and server view files. The single source of truth for route existence, and a required deployment artifact: it ships beside the application, the access model and the SEO policy are gated on it, and a deployment without one fails to start rather than serving unprotected pages.
_Avoid_: route map, route config

**Route table**:
The client runtime's per-load binding produced by `createRouteTable` from the framework package (`@rubichandrap/poyo/runtime`): the registry mapped to lazy components plus name/path lookups. Derived from the registry, never the source of truth. The typed route names and paths (`RouteName`, `RoutePath`, the `routePath()` helper) are runtime API derived from the registry — app code imports them from the runtime, never from a generated file.
_Avoid_: routes registry, typed manifest

**Route loader**:
The thin Vite-boundary adapter in generated projects (`src/routes/route-loader.ts`): globs the page files, resolves the base path, calls `createRouteTable`, and re-exports its API.
_Avoid_: route engine, route resolver

**Dynamic navigation**:
The capability where an internal navigation swaps only the page component below the loaded shell instead of reloading the document, preserving client state. Driven explicitly — programmatically through the Router or declaratively through `Link` — never by intercepting arbitrary anchors. After a client-side navigation, browser Back/Forward swap pages the same way. A Document load remains the floor: the first load of any URL, and the fallback for every failure.
_Avoid_: hybrid navigation, soft navigation, SPA mode, client-side routing

**Document load**:
A full browser navigation that requests and renders a server document (a Razor view) and boots the React application anew. The initial load of any URL, the result of an unadorned `<a>` click, and the guaranteed floor under Dynamic navigation whenever a client-side swap cannot proceed — the URL returns to the browser, which preserves the history operation the caller requested. The noun Dynamic navigation and the map's fallback both name.
_Avoid_: hard navigation, full page reload, browser reload, full reload

**Router**:
The programmatic navigation API: `useRouter` (push, replace, back, forward, and the current route as reactive state) plus the factory that wires it. `Link` is its declarative counterpart — link clicks and router calls share one navigation path.
_Avoid_: client router library, SPA router

**Server core**:
The framework-owned server-side code — route policy, route schema, route identity, access and SEO enforcement, the page result that answers navigation requests — shipped as readable source inside the framework package and compiled into the server project in place. Never copied into the project tree and never published as a separate package; upgraded by updating the framework package, not by editing the files.
_Avoid_: server runtime, NuGet package, shared module

**Project identity**:
The facts the package's CLI derives from a generated project rather than assuming from the template — the server namespace and the client/server directory names. Scaffolding renames the project, so tooling that hardcodes the template's names breaks in generated projects.
_Avoid_: project name, namespace config

**Hosting environment**:
The environment name the application booted as, owned by the process: the deploy host owns it in a deployment, and development tooling owns it for a run-from-source launch. A host names it with `DOTNET_ENVIRONMENT` or `ASPNETCORE_ENVIRONMENT` — the first in preference to the second, the order the framework itself uses — and the server reads it before anything else loads, so the environment file cannot decide it. An unset hosting environment is production: the framework's own default and the safe direction.
_Avoid_: deployment environment, mode

**Environment file**:
A development convenience (`.env`) the launch profile names, holding the values a developer's machine owns for both the client and the server. Read only when the process says development or says nothing, and only ever fills a gap: a value the process already set is never overridden, and the file never contributes the hosting environment. Not read at all once the process names the environment — but an unset environment is production *and still reads the file*, so a deployment that forgets to set it applies the file's other values. Never copied into publish output.
_Avoid_: configuration, settings file, env config

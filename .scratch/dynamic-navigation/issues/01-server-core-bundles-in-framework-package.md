# 01 — Server core bundles in the framework package

**What to build:** The server core — the route policy with its strict registry interpretation, the universal access and SEO enforcement, the page result and generic page controller, the custom-controller helper, and the service/endpoint registration extensions — lives as readable source inside the framework package's `server/` folder under the fixed framework namespace. The template's server project compiles it in place through the installed package (the csproj include with `LinkBase`, a defensive remove for node_modules globs, and the missing-package guard that tells the developer to run `pnpm install`). The template's frozen framework copies are deleted; its Program wiring shrinks to the registration extensions; the exception handler stays app-side. The template behaves exactly as today — same pages, same redirects, same tests — but the framework code is now carried and upgraded by updating the framework package.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The framework package declares and ships the server source folder (package files whitelist) under the fixed namespace
- [x] The template's server compiles the framework source in place; a fresh `dotnet build` succeeds with the folder present
- [x] The missing-package case fails the build with a clear "run pnpm install" error, not a glob mystery
- [x] The template's server no longer contains its own route policy, filters, page result, or page controller; the exception handler remains
- [x] Template Program wiring uses the registration extensions (services + endpoint mapping) and is shorter than the current ~30 lines
- [x] Custom-controller ergonomics available (`this.PoyoPage(data)` resolving view path, page name, SEO from context)
- [x] `Poyo.Server.Tests` pass unchanged in behavior: boot validation, access redirects, SEO defaults, missing-view 500s
- [x] ADR 0008's spike form is what ships (include path follows the installed package through the workspace link)

# The server core ships inside the framework package and compiles in place

**Status**: accepted. Extends ADR 0005's ownership argument to the server side; consumed by the template's `Poyo.Server.csproj`.

ADR 0005 moved `usePage` into the npm framework package because framework code copied into every generated project cannot be upgraded independently. The server half of that argument was left standing: `RoutePolicy`, `RouteDefinition`, `RouteAccessFilter`, `SeoPolicyFilter`, and `PageController` live in the template and are frozen at scaffold time — a fix to any of them reaches zero existing projects, and the spec's "template updatable without re-scaffolding" promise is only true for the CLI. The internal Pwo framework answered this with a NuGet package (`Pwo.AspNetCore`, its ADR-0008); Poyo publishes to npm and GitHub only, with no NuGet feed and no account, so that door is closed. JsxCore demonstrates the shape we adopt instead: **the one artifact the consumer already installs is the carrier for the entire core** — its runtime, tsconfig, and build tool all ride inside the single NuGet package, with nothing of its own published to npm. Poyo's carrier is `@rubichandrap/poyo`: the C# server core ships inside the npm package under `server/`, and the generated project's csproj **compiles it in place** — no copy, no materialization step, no second feed.

**Decision**:

1. `packages/poyo/server/` holds the server core source: `RoutePolicy.cs`, `RouteDefinition.cs`, `RouteAccessFilter.cs`, `SeoPolicyFilter.cs`, `PageResult.cs`, `PageController.cs`, `PwoPage`-style controller extensions (`this.PoyoPage(data)`), and service/endpoint extensions (`AddPoyo()`, `MapPoyoRoutes()`). The namespace is fixed as `Poyo.Framework`. The package's `files` whitelist ships the folder.
2. The template's `Poyo.Server.csproj` gains two lines:

   ```xml
   <Compile Remove="node_modules/**/*.cs" />
   <Compile Include="../node_modules/@rubichandrap/poyo/server/**/*.cs" LinkBase="Framework" />
   ```

   The files open in the IDE under `Framework/` (via `LinkBase`) and remain browsable — readable source is a feature of a starter framework, not a leak.
3. The template loses its own copies: `Routing/RoutePolicy.cs`, `Routing/RouteDefinition.cs`, `Routing/RouteAccessFilter.cs`, `Routing/SeoPolicyFilter.cs`, and `Controllers/PageController.cs` are deleted from the template tree. `GlobalExceptionHandler` stays app-side — it is per-app customization surface, not framework contract.
4. An `Exists` guard + `<Error>` target fails the build with "server core not found — run `pnpm install`" when the package is missing, converting the design's one confusing failure mode into an instruction.

**Why not the alternatives**:

- **CLI-managed copy** (`poyo sync`/`poyo update` materializing files into the project): rejected — it reintroduces exactly the frozen-copy problem ADR 0005 identified, now with extra steps; the upgrade story would depend on a CLI run instead of `pnpm update`.
- **Compiled DLL inside the tarball** (`HintPath` reference): rejected — it hides the source, which is the value of a reference framework; JsxCore can afford opacity because its core is a finished product, Poyo's core is teaching material.
- **NuGet package**: rejected for this project — no NuGet account or feed; the npm package is already installed everywhere the server builds.

**Verified**: a spike (dotnet 10.0.401) compiled and ran C# through a pnpm-style symlinked `node_modules/@rubichandrap/poyo` package with the include form above — MSBuild globs follow the symlink, and where `node_modules` sits under the project dir the SDK's default glob even picks the files up on its own (hence the defensive `Compile Remove`). Windows junction behavior remains to be confirmed on a Windows machine; the failure mode there is a build error, not silent breakage.

**Consequences**: generated projects receive server-side framework fixes via `pnpm update @rubichandrap/poyo` alone; rename-safety holds for everything under `node_modules` — the scaffolder's `/Poyo/g` rewrite never touches the installed package, so the server core and its wire literals cannot be corrupted there; template files that call the core (`Program.cs`'s `using Poyo.Framework;`, `AddPoyo`, `MapPoyoRoutes`, `PoyoPage`, `X-Poyo-Navigation`) are protected by the scaffolder's sentinel pass, which wraps those fixed identifiers before the rename rules run and unwraps them after; in the monorepo, template dev picks up `server/` edits on the next `dotnet build` through the workspace link; every `dotnet build` of the server now requires a prior `pnpm install` (already true — the client build needs it too); `pnpm update` does not run `poyo generate`-style hooks, so registry-shape changes in the core must stay backward-compatible or ship with a CLI release note. Fixture e2e extends to assert the include compiles in a scaffolded project.

# Spec — Unified Page data production in the Server core

ADRs: docs/adr/0008-server-core-bundled-in-framework-package.md, docs/adr/0009-dynamic-navigation.md, docs/adr/0012-unified-page-data-production.md
Decided in grilling session (2026-09-24); testing seams and architectural invariants confirmed with maintainer.
Status: implemented in PR #62

## Problem Statement

Page data production in Poyo is split across two divergent paths: custom controllers provide data through `this.PoyoPage(data)`, while default routes author `ViewBag.ServerData` inside `.cshtml` Razor views.

This creates critical architectural and safety liabilities:
1. **Script Breakout / Premature Tag Termination**: Razor layouts output `@:window.SERVER_DATA = @Html.Raw(ViewBag.ServerData);`. While recent hardening (commit `1351e1f`) addressed semicolon truncation, any payload containing raw `</script>` terminates the document `<script>` block prematurely in the browser HTML parser, truncating the JSON payload and exposing an XSS vector.
2. **Brittle Layout-Text Dependency in Navigation**: For default routes, descriptor requests (`X-Poyo-Navigation: 1`) must execute the Razor view into a throwaway `StringWriter` to scrape `window.SERVER_DATA` out of the rendered layout markup using `ExtractServerData`. This couples descriptor generation to layout text formatting and wastes server resources double-rendering views. Test fixtures such as `/StaticData` (`routes.descriptor.json:58-65`) still rely on this view-authored path.
3. **Availability Asymmetry on Missing Views**: Document requests for routes with missing views fail at runtime with HTTP 500 (`MissingViewRouteTests`). But for descriptor requests, `FindView` was historically placed inside the null-payload branch of `PageResult`, meaning a custom controller with Page data but a missing Razor view returned HTTP 200 OK—advertising a route on navigation that cannot be rendered on document reload.
4. **Client-Server Shape Mismatch**: While `usePage` on the client strictly returns only plain objects and silently discards primitives and arrays, `PoyoPage` accepts any valid JSON value, introducing silent data loss when non-objects are supplied.

## Solution

Consolidate Page data production deeply into the Server core with strict invariants:

1. **Controller-Only Authoring**: Controllers strictly own Page data via `this.PoyoPage(data)`. Razor views do not author Page data. If a route requires Page data (including test fixtures like `/StaticData`), it must be mapped to a controller action; default routes without custom controllers serve static views with no Page data.
2. **Object-Only Enforced at the Seam**: `PoyoPage` accepts only a JSON Object or absence (`null`). Arrays, primitives, and malformed JSON are rejected immediately with an `ArgumentException` at the authoring call site, aligning with `usePage`'s contract.
3. **Safe Document Embedding**: The Server core owns the HTML script emission via `@Html.PoyoPageData()`. Missing or null data emits `HtmlString.Empty`. Non-null data is serialized using `JavaScriptEncoder.Default` (escaping `<` as `\u003C`), guaranteeing that `</script>` cannot break out of the tag.
4. **Representation Parity**: For the same normalized controller-produced Page data value, document `window.SERVER_DATA` and descriptor `pageData` are **structurally equal JSON values** (`JsonElement.DeepEquals`), not byte-identical text, since document embedding intentionally escapes HTML-sensitive characters (`\u003C`). A later descriptor request runs the controller again, so time-varying fields can differ from the earlier document request.
5. **Availability Parity on Missing Views**: On descriptor requests, the Server core queries the view engine via a non-executing `FindView` check before inspecting Page data. If the view does not exist on disk, the descriptor immediately returns HTTP 404 Not Found, ensuring client navigation never swaps into an unavailable route.
6. **Elimination of Text Scraping**: Reverse-parsing rendered HTML strings and shallow JSON validation helpers (`ExtractServerData`, `PoyoJson.cs`) are deleted entirely.
7. **Legacy Key Detection**: Detect `ViewData["ServerData"]` and warn in development that the legacy `ServerData` key is an unsupported channel.
8. **Documentation & ADR Alignment**: ADR 0012 supersedes ADR 0005's `ViewBag.ServerData` claim; update `README.md`, `AGENTS.md`, runtime docs, and all package changelogs.

## User Stories

### Authoring & Validation

1. As an application developer, I want `this.PoyoPage(data)` to accept any C# object or record representing a JSON object, so that my page data is strongly typed and serialized automatically using camelCase property naming.
2. As an application developer, I want `this.PoyoPage(jsonString)` to accept pre-serialized JSON strings representing objects, so that pre-computed or cached JSON payloads can be passed directly.
3. As an application developer, I want `this.PoyoPage` to immediately throw an `ArgumentException` if I pass a primitive (number, boolean, raw string) or an array, so that I am notified of invalid shapes at the call site instead of experiencing silent data loss in React.
4. As an application developer, I want `this.PoyoPage` to wrap any `JsonException` in an `ArgumentException` when a malformed JSON string is passed, so that invalid input consistently raises argument errors.
5. As an application developer, I want caller-supplied `JsonElement` values to be cloned (`.Clone()`), so that data held by `PageResult` is memory-safe across async boundaries.
6. As an application developer, I want `this.PoyoPage()` with null or omitted data to represent absence cleanly, so that routes without server data need no dummy payloads.
7. As a developer passing an externally managed `JsonElement` to `this.PoyoPage`, I want its bytes cloned, so that disposing its originating `JsonDocument` before view rendering never throws an `ObjectDisposedException`.
8. As a developer migrating from earlier betas, I want a diagnostic warning in development mode if `ViewData.ContainsKey("ServerData")` is present, so that I am informed that the legacy `ServerData` key is an unsupported channel.

### Document Embedding & Safety

9. As a security-conscious developer, I want Page data containing `</script>` to be safely escaped when rendered into HTML (`\u003C/script\u003E`), so that user-provided content cannot terminate the script block or execute XSS attacks.
10. As a frontend developer, I want the document to emit `<script>window.SERVER_DATA = ...;</script>`, so that the browser's JavaScript engine parses the exact original string content without data loss.
11. As a frontend developer, I want pages without Page data to emit no `<script>` tag at all, so that clean HTML is served and `window.SERVER_DATA` remains unset.
12. As a template developer, I want `_Layout.cshtml` to call `@Html.PoyoPageData()` instead of writing raw `<script>` and `@Html.Raw` blocks, so that safe script emission is handled by the framework core.

### Dynamic Navigation & Availability Parity

13. As an application developer, I want a Dynamic navigation descriptor request (`X-Poyo-Navigation: 1`) to return a JSON object structurally equal to the document's representation of the same normalized value, so that navigation preserves Page data semantics; a later request may still refresh time-varying fields.
14. As a client runtime consumer, I want descriptor requests to return `{ name, seo, pageData }` without executing Razor view templates on the server, so that server load and latency are minimized.
15. As an application developer, I want descriptor requests for routes whose Razor view is missing on disk to return HTTP 404 Not Found (availability parity), so that client navigation never swaps into a route whose document cannot render.
16. As an application developer, I want custom-controller routes with missing views to return 404 on descriptor requests, so that availability parity is maintained regardless of controller usage.
17. As a frontend developer, I want the descriptor's `pageData` property to be `null` when a route has no Page data, so that the navigation store clears prior page data upon navigation.

### Template & Scaffolding

18. As a fresh-clone developer, I want the Template's Dashboard to demonstrate Page data via a dedicated `DashboardController`, so that the Template serves as an idiomatic reference for controller-based data injection.
19. As an application developer running `pnpm create poyo-app MyApp`, I want `@Html.PoyoPageData()` in `_Layout.cshtml` to remain intact through the project rename via the `PoyoPage` prefix protection, so that the scaffolded project compiles without errors.
20. As a framework maintainer, I want `fixture-e2e.test.mjs` to parse document server data through `</script>` rather than stopping at the first semicolon, so that payloads with embedded semicolons do not break release verification.

## Implementation Decisions

- **Strict Controller Ownership**: Razor views are purely view containers. All Page data must originate from controller actions calling `this.PoyoPage(data)`. Default routes (`PageController.Index`) supply `null` Page data. The `/StaticData` fixture route (`routes.descriptor.json:58-65`) is mapped to an action on `TestCustomController` that returns `this.PoyoPage(data)`, eliminating view-authored test dependencies.
- **Root Element Validation**: `PoyoPage` normalizes input into a structured `JsonElement?`. If the element's `ValueKind` is not `JsonValueKind.Object`, it throws `ArgumentException`. If `pageData` is a string, parsing errors (`JsonException`) are caught and rethrown as `ArgumentException`.
- **Memory Safety & Element Cloning**: Pre-serialized JSON strings and caller-supplied `JsonElement` instances are explicitly cloned (`.Clone()`), ensuring memory safety across asynchronous execution boundaries even when the caller disposes the underlying `JsonDocument`.
- **CamelCase Preservation**: Serializing C# objects to `JsonElement` preserves `JsonNamingPolicy.CamelCase`.
- **Helper Packaging**: The safe emission helper `@Html.PoyoPageData()` is declared in `namespace Poyo.Framework`. `_ViewImports.cshtml` in the template includes `@using Poyo.Framework`.
- **Escaping Strategy**: `@Html.PoyoPageData()` serializes the `JsonElement` using `System.Text.Json` configured with `JavaScriptEncoder.Default`, converting `<` to `\u003C` and `>` to `\u003E`. Missing or null data returns `HtmlString.Empty`.
- **Legacy Key Diagnostic**: In Development environments, if `ViewData.ContainsKey("ServerData")` is present in `ViewContext`, log a warning indicating that the legacy `ServerData` key is an unsupported channel, regardless of whether controller Page data is also present.
- **Availability Guard**: `PageResult.ExecuteDescriptorAsync` queries `ICompositeViewEngine` via `FindView` as its first step. If the view cannot be found, it sets HTTP 404 and returns immediately.
- **Deletion of Scraping Code**: `ExtractServerData` and `PoyoJson.cs` are deleted. Throwaway `view.RenderAsync` execution into `StringWriter` is removed from `PageResult`.
- **Documentation Updates**: ADR 0012 supersedes ADR 0005's `ViewBag.ServerData` channel claim. `README.md`, `AGENTS.md`, client runtime docs (`packages/poyo/src/runtime/use-page.ts`), and changelogs across all three packages will be updated accordingly.

## Testing Decisions

- A good test verifies external behavior at the boundary (HTTP response status, content type, headers, and DOM/JSON payload structural equality), not internal implementation variables. Tests must avoid implementation-shaped assertions on internal dictionary keys like `ViewData["ServerData"]`.
- **Seams across the four test layers:**
  1. `Poyo.Server.Tests`:
     - Unit tests directly asserting `PoyoPage` normalization: accepting valid objects, accepting valid JSON strings representing objects, and throwing `ArgumentException` on primitives, arrays, and malformed JSON.
     - Unit test asserting that passing a `JsonElement`, disposing its originating `JsonDocument`, and rendering the page succeeds without `ObjectDisposedException`.
     - Integration tests on `WebApplicationFactory<Program>` (`DescriptorContractTests`) verifying availability parity (404 on missing views for default and custom controllers), document vs descriptor structural equality (`JsonElement.DeepEquals`), safe `</script>` character escaping, and null page data on unprovided routes.
  2. `packages/poyo` Vitest: Runtime tests asserting `usePage` consumes structured object page data and handles null cleanly.
  3. `create-poyo-app` Vitest (`scaffold.test.ts`): Regression tests ensuring `PoyoPageData` survives project rename via existing `PoyoPage` prefix protection.
  4. `fixture-e2e.test.mjs`: End-to-end release fixture testing on a scaffolded project asserting `/Login` has no server data, `/Dashboard` has safe server data parsed through `</script>`, and descriptor payloads match.

## Out of Scope

- Introducing a generic `PoyoPage<T>` strongly-typed result wrapper (dynamic `object?` is sufficient and matches existing API).
- Streaming or chunked Page data injection.
- Client runtime changes (runtime `usePage` and navigation store remain untouched as they already adhere to this contract).

## Further Notes

- ADR 0012 will be recorded in `docs/adr/0012-unified-page-data-production.md` alongside this spec, explicitly superseding ADR 0005's `ViewBag.ServerData` channel claim.
- Migration instructions will be included in `CHANGELOG.md` for projects upgrading from beta releases.

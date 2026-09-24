# Unified Page data production in the Server core

**Status**: accepted. Decided in grilling session (2026-09-24); explicitly supersedes ADR 0005's claim that `ViewBag.ServerData` is the server data channel.

Page data production in Poyo was previously split across two divergent paths: custom controllers provided data through `this.PoyoPage(data)`, while default routes authored `ViewBag.ServerData` directly inside `.cshtml` Razor views. Layouts emitted this data into the document via `@:window.SERVER_DATA = @Html.Raw(ViewBag.ServerData);`.

This dual-track model introduced critical architectural, security, and availability liabilities:
1. **Script breakout and premature tag termination**: Emitting raw JSON into a document `<script>` tag via `@Html.Raw` allows any payload containing `</script>` (such as user-generated content or markdown) to terminate the script block prematurely in browser HTML parsers, truncating the JSON payload and exposing an XSS vector.
2. **Brittle layout-text scraping in dynamic navigation**: For default routes, dynamic navigation descriptor requests (`X-Poyo-Navigation: 1`) had to execute the Razor view into a throwaway `StringWriter` to scrape `window.SERVER_DATA` out of the rendered layout markup using `ExtractServerData`. This coupled descriptor generation to layout HTML text formatting, wasted server CPU executing views solely to discard their markup, and made navigation dependent on text parsing.
3. **Availability asymmetry on missing views**: Document requests for routes with missing views fail at runtime with HTTP 500 (`MissingViewRouteTests`). For descriptor requests, `FindView` was historically placed inside the null-payload branch of `PageResult`, meaning a custom controller returning Page data for a route with a missing Razor view returned HTTP 200 OK—advertising a route during client navigation that cannot be rendered on document reload.
4. **Client-server shape mismatch**: While the client runtime's `usePage` accessor strictly returns plain objects and silently discards primitives and arrays, `PoyoPage` accepted any JSON value, introducing silent data loss when non-objects were passed.

We consolidate Page data production deeply into the Server core (`Poyo.Framework`) with strict invariants.

**Decisions**:

1. **Strict controller ownership**: Controllers strictly own Page data via `this.PoyoPage(data)`. Razor views do not author Page data; views are purely presentation templates. Default routes without custom controllers (`PageController.Index`) supply `null` Page data. If a route requires Page data (including test fixtures like `/StaticData`), it must be mapped to a controller action returning `this.PoyoPage(data)`.
2. **Object-only shape invariant enforced at the seam**: `PoyoPage` accepts only a JSON Object or absence (`null`). Arrays, primitives, and malformed JSON are rejected immediately with an `ArgumentException` at the authoring call site, aligning with `usePage`'s contract. Serializing C# objects to `JsonElement` preserves `JsonNamingPolicy.CamelCase`. Pre-serialized JSON strings representing objects are accepted; malformed JSON wraps `JsonException` in `ArgumentException`.
3. **Safe document embedding via `@Html.PoyoPageData()`**: The Server core owns HTML script emission via `@Html.PoyoPageData()`. Missing or null data emits `HtmlString.Empty`. Non-null data is serialized using `System.Text.Json` configured with `JavaScriptEncoder.Default` (escaping `<` as `\u003C` and `>` as `\u003E`), guaranteeing that `</script>` cannot break out of the tag. Layout markup calls `@Html.PoyoPageData()`, deleting `@Html.Raw(ViewBag.ServerData)`.
4. **Structural parity over byte identity**: Document `window.SERVER_DATA` and descriptor `pageData` guarantee **structurally equal JSON values** (`JsonElement.DeepEquals`), not byte-identical text, since document embedding intentionally escapes HTML-sensitive characters (`\u003C`).
5. **Non-executing view availability guard (404 parity)**: On descriptor requests (`X-Poyo-Navigation: 1`), `PageResult` queries the view engine (`ICompositeViewEngine.FindView`) before inspecting Page data. If the view does not exist on disk, the descriptor immediately returns HTTP 404 Not Found, establishing availability parity between custom and default routes and ensuring client navigation never swaps into an unavailable route that cannot render on reload.
6. **Deletion of layout text scraping**: `ExtractServerData` and `PoyoJson.cs` are deleted. Throwaway `view.RenderAsync` execution into `StringWriter` is removed from `PageResult`; descriptor requests never execute Razor views.

**Considered options**:

- **View-authored Page data via `@section ServerData` or `@Html.SetServerData(...)`**: Rejected — keeps view execution on descriptor requests, couples descriptor generation to view rendering, and perpetuates split data ownership between controllers and views. Controllers are MVC's data orchestrators; views are templates.
- **Permitting primitives and arrays in `PoyoPage`**: Rejected — `usePage` on the client returns plain objects and discards primitives/arrays. Allowing non-objects at the controller level invites silent client bugs; the seam must fail fast at authoring call sites.
- **Unescaped `@Html.Raw` script embedding**: Rejected — unescaped `<` allows `</script>` breakouts and XSS. `JavaScriptEncoder.Default` ensures safe script embedding.
- **Executing views to extract Page data on descriptor requests**: Rejected — double-rendering views wastes CPU and couples navigation to view rendering; a non-executing `FindView` check provides fast, fail-safe 404 availability parity without rendering.

**Consequences**:

- **Performance**: Dynamic navigation descriptor requests avoid all Razor view execution, reducing server CPU overhead and latency during client-side transitions.
- **Reliability**: Navigation failures for missing views fail fast with 404 before swapping client components, preventing user-facing mismatches between navigation and full reload.
- **Compatibility & Migration Guidance**: Restricting `this.PoyoPage` to objects is a breaking change for routes previously supplying primitives or arrays. Callers must wrap non-object values in a top-level property (e.g., `{ items = ... }`). Upgrading projects must replace `ViewBag.ServerData` assignments in views with controller `this.PoyoPage(data)` calls and update `_Layout.cshtml` to invoke `@Html.PoyoPageData()`. Release notes across all package changelogs will document this breaking seam.

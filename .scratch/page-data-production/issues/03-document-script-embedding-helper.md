# 03: Safe Document Script Embedding Helper and Legacy Diagnostic

**What to build:** Implement `@Html.PoyoPageData()` in the Server core (`Poyo.Framework`) to safely embed Page data into the HTML document. When Page data is missing or null, emit `HtmlString.Empty`. When present, serialize the `JsonElement` using `JavaScriptEncoder.Default` (escaping `<` as `\u003C`) into `<script>window.SERVER_DATA = ...;</script>`, preventing `</script>` tag breakout. Detect the presence of the legacy `ViewData["ServerData"]` key in Development environments and log a warning that `ServerData` is an unsupported channel—both when controller data is absent and when controller data is present. Wire `@using Poyo.Framework` into `_ViewImports.cshtml` and replace raw script emission in `_Layout.cshtml`.

**Blocked by:** 02: Authoring Seam Normalization in PoyoPage

**Status:** done — implemented in PR #62

- [x] `@Html.PoyoPageData()` is implemented in `namespace Poyo.Framework`.
- [x] `@Html.PoyoPageData()` emits `HtmlString.Empty` when Page data is absent or null.
- [x] `@Html.PoyoPageData()` serializes non-null object data with `JavaScriptEncoder.Default` into `<script>window.SERVER_DATA = ...;</script>` with trailing semicolon.
- [x] A development diagnostic warning is logged whenever `ViewData.ContainsKey("ServerData")` is detected, covering both cases (no controller data, and controller data present with legacy key).
- [x] `packages/poyo-template/Poyo.Server/Views/_ViewImports.cshtml` includes `@using Poyo.Framework`.
- [x] `packages/poyo-template/Poyo.Server/Views/Shared/_Layout.cshtml` replaces raw `<script>` and `@Html.Raw` with `@Html.PoyoPageData()`.
- [x] Unit tests in `Poyo.Server.Tests` verify safe `<script>` emission, empty output on null, and legacy key diagnostic logging.
- [x] A scaffolding regression test in `create-poyo-app/test/scaffold.test.ts` proves `PoyoPageData` remains untouched through project renaming via `PoyoPage` prefix protection.

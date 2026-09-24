# 04: Navigation Availability Guard, Scraping Deletion & Contract Tests

**What to build:** In `PageResult.ExecuteDescriptorAsync`, unconditionally query the view engine using a non-executing `FindView` check first, returning HTTP 404 for missing views across default and custom-controller routes alike (availability parity). Completely delete `ExtractServerData`, `PoyoJson.cs`, and throwaway Razor view rendering during navigation. Map `/StaticData` in `routes.descriptor.json` to an action on `TestCustomController`. Add contract integration tests asserting availability parity, structural equality (`JsonElement.DeepEquals`) between document and descriptor, and safe `</script>` character escaping.

**Blocked by:** 03: Safe Document Script Embedding Helper and Legacy Diagnostic

**Status:** done — implemented in PR #62

- [x] `PageResult.ExecuteDescriptorAsync` queries `FindView(context)` as its first step; returns HTTP 404 immediately if null.
- [x] `ExtractServerData` and `PoyoJson.cs` are deleted from the codebase.
- [x] Throwaway `view.RenderAsync` execution into `StringWriter` is removed from `PageResult`.
- [x] `/StaticData` in `packages/poyo-template/Poyo.Server.Tests/Fixtures/routes.descriptor.json` is mapped to a custom controller action returning deterministic Page data via `this.PoyoPage(data)`.
- [x] Contract tests in `DescriptorContractTests` verify HTTP 404 on missing views for both default routes and custom-controller routes.
- [x] Contract tests verify document and descriptor produce structurally equal JSON values (`JsonElement.DeepEquals`), with document `<script>` properly escaping `</script>` as `\u003C/script\u003E`.
- [x] Contract tests verify adversarial payloads containing semicolons, entities, and special characters survive intact.
- [x] Implementation-shaped assertions on `ViewData["ServerData"]` in `PageResultTests` are deleted or replaced with behavioral assertions.

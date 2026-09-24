# 05: Template Dashboard Migration and Fixture Slicing

**What to build:** Migrate the starter template's `/Dashboard` route to the canonical controller-authored pattern. Scaffold `DashboardController` in `Poyo.Server` returning `this.PoyoPage(dashboardData)`, map it in `routes.json` (`"controller": "Dashboard", "action": "Index"`), and remove C# view data assignment from `Views/Dashboard/Index.cshtml`. Update `scripts/fixture-e2e.test.mjs` to parse document server data through `</script>` rather than stopping at the first semicolon, eliminating false failures on payloads with embedded semicolons.

**Blocked by:** 04: Navigation Availability Guard, Scraping Deletion & Contract Tests

**Status:** ready-for-agent

- [ ] `packages/poyo-template/Poyo.Server/Controllers/DashboardController.cs` is created, inheriting from `Microsoft.AspNetCore.Mvc.Controller` and returning `this.PoyoPage(dashboardData)`.
- [ ] `packages/poyo-template/routes.json` maps `/Dashboard` to `"controller": "Dashboard", "action": "Index"`.
- [ ] `packages/poyo-template/Poyo.Server/Views/Dashboard/Index.cshtml` is cleaned up to be a clean Razor view without inline `ViewBag.ServerData` serialization.
- [ ] `scripts/fixture-e2e.test.mjs` is updated around line 777 to parse document `window.SERVER_DATA` through `</script>` and trim trailing semicolons.
- [ ] Local template build (`pnpm --filter poyo-template build`) and server tests pass cleanly.

# 06: Documentation Updates and Release Changelogs

**What to build:** Update project documentation, architectural guidelines, runtime docstrings, and package changelogs to reflect controller-only Page data via `this.PoyoPage(data)` and safe script embedding via `@Html.PoyoPageData()`. Document the distinction between the local pre-publish test gates and the post-publish fixture e2e gate.

**Blocked by:** 05: Template Dashboard Migration and Fixture Slicing

**Status:** ready-for-agent

- [ ] `README.md` and `AGENTS.md` are updated to state that Page data is strictly controller-authored via `this.PoyoPage(data)` and embedded via `@Html.PoyoPageData()`.
- [ ] Client runtime docstring in `packages/poyo/src/runtime/use-page.ts` is updated to describe the controller-supplied Page data model.
- [ ] `CHANGELOG.md` at root and across all three packages (`packages/poyo`, `packages/poyo-template`, `packages/create-poyo-app`) contains migration notes detailing the removal of view-authored `ViewBag.ServerData`.
- [ ] All unit, integration, and scaffolder test suites run green locally.

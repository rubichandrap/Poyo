# 02 — Template consumes usePage from the framework package

**What to build:** The template's client depends on the framework package and the Dashboard demo reads server data through usePage imported from @rubichandrap/poyo/runtime. The template-local hook copy and its window.d.ts typing are gone, so every new project starts from the canonical package import and builds green.

**Blocked by:** #24

**Status:** done — PR #29

- [x] poyo.client declares "@rubichandrap/poyo": "workspace:*" in devDependencies
- [x] Dashboard imports usePage from @rubichandrap/poyo/runtime and renders server data identically to before
- [x] src/hooks/ (use-page.ts + barrel) and src/types/window.d.ts are deleted
- [x] Client build, type-check, lint, and dotnet build are green

GitHub: https://github.com/rubichandrap/Poyo/issues/25

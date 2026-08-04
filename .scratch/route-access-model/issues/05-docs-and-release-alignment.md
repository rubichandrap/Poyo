# 05 — Docs + release alignment for access model

**What to build:** Documentation and release artifacts align with the v2 registry and universal enforcement: AGENTS.md (route flags map to access, PageController single action, GuestOnlyAttribute removed, SEO rule for all routes, custom-controller enforcement), template and package READMEs, lockstep CHANGELOG entries, and two ADRs: 0003 (access model cut: single field, strict rejection, no shim) and 0004 (universal access enforcement + PageController collapse). CONTEXT.md already carries the access / Route policy terms.

**Blocked by:** 03 — Contract cut: v2 template registry + universal access enforcement; 04 — Home normalization + fallback cleanup

**Status:** done

- [x] AGENTS.md describes the access model, universal enforcement, and removed GuestOnlyAttribute
- [x] READMEs match v2 registry examples
- [x] Lockstep CHANGELOG entries added
- [x] ADR 0003 (access model cut) recorded
- [x] ADR 0004 (universal enforcement + collapse) recorded

GitHub: https://github.com/rubichandrap/Poyo/issues/21

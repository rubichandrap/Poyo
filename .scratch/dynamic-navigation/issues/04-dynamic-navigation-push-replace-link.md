# 04 — Dynamic navigation: `push`, `replace`, `Link`

**What to build:** The first dynamic-navigation tracer bullet, explicit-only. The runtime grows the navigation core: fetch the page descriptor (framework navigation header) → shape-check it (top-level only; anything else is not a navigation) → resolve the page name through the route table → commit route + page data to the navigation store atomically → write history → apply SEO → move focus and announce the swap. `useRouter()` exposes push, replace, and the reactive current route; `<Link>` ships from the link subpath with its own click rules (primary button, no modifiers, same-origin inside the base path, no target/download, opt-out attribute honored, externals native). `usePage` reads the store; the server-injected global seeds it on first load. Every failure — non-2xx, non-descriptor body, unknown page name, apply error — ends in a document load of the same URL. No global interception anywhere: plain anchors stay document loads by design. The server side arrives with ticket 01's page result descriptor branch.

**Blocked by:** 01 — Server core bundles in the framework package; 03 — Manifest encapsulation (typed href for `Link`)

**Status:** ready-for-agent

- [ ] `router.push(url)` swaps the page component without a document reload; client state (providers, query cache) survives
- [ ] `router.replace(url)` swaps and replaces the history entry; rapid pushes are last-write-wins (a stale response never swaps twice)
- [ ] The page's `usePage` payload after a swap is the descriptor's page data, byte-consistent with what a document load would have injected
- [ ] `<Link>` navigates client-side for eligible clicks and keeps native behavior for externals, modifier clicks, non-primary buttons, target/download, and the opt-out attribute
- [ ] The shell renders the current route reactively from `useRouter` without a provider; an unknown server-declared page name still renders the not-found UI
- [ ] SEO (title/description) updates from the descriptor; focus moves to the page region; the swap is announced via a live region
- [ ] Every failure path degrades to a document load of the same URL (the always-correct floor)
- [ ] Imports split per the decided surface: `Link` from the link subpath, `useRouter`/`createRouter` from the router subpath, both re-exported at the runtime root
- [ ] Runtime tests cover push/replace commits, descriptor rejection → fallback, Link click rules, store seeding, and the supersede token

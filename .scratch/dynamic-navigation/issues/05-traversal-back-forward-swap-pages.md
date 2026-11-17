# 05 — Traversal: Back/Forward swap pages, scroll restored

**What to build:** Next.js-parity history traversal on the popstate path only. When the current URL was reached by a client-side navigation, browser Back/Forward fetch the descriptor for the destination and swap the page — no document reload; when it wasn't, traversal is the ordinary document load. History entries store their scroll position while the machinery is installed; traversing back to an entry restores it. A hash-only change never enters the machinery (the browser owns anchor scrolling). A failed traversal degrades to a document load of the target URL.

**Blocked by:** 04 — Dynamic navigation: push, replace, Link

**Status:** done

**Completion:** Done. GitHub issues #43-#50 are closed. Later traversal and scroll decisions are recorded in ADR 0019.

- [x] Back/Forward after a client-side navigation swap the page via descriptor without a document load
- [x] Superseded by ADR 0019: every same-document entry, including a cold entry, is traversable through a descriptor; document fallback remains available.
- [x] Scroll position is stored per history entry and restored on traversal return; fresh pushes start at the top
- [x] Hash-only changes keep native anchor behavior
- [x] A failed traversal (unreachable descriptor, unknown page) falls back to a document load of the target URL
- [x] Runtime tests cover traversal commits, scroll restore, the hash guard, and the cold-entry document load

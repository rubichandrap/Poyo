# Archived text from ADR 0009

Superseded by ADR 0019. Kept verbatim so the history of the decision stays readable; the current decision is in [`../0009-dynamic-navigation.md`](../0009-dynamic-navigation.md).

if the current URL was reached by `push`/`replace`, browser Back/Forward fetch a descriptor and swap the page (`popstate` path only); otherwise traversal is the ordinary document load. *Superseded in part by ADR 0019: the "otherwise" clause assumed `popstate` fires for entries of other documents, which it does not; every same-document entry is now traversed through the descriptor.*

## Decision 6, as decided 2026-09-23

Amended 2026-11-18: a superseded descriptor request is now aborted at the transport, and `destroy()` cancels in-flight work (decision 6 as rewritten, and decision 8).

> 6. **Popstate guards from review**: a hash-only change never enters the machinery (the browser owns anchor scrolling), and a last-write-wins token drops superseded traversals.

## Decision 7, final sentence, as decided 2026-09-23

Amended 2026-11-18: the client now carries the registry's `dynamic` flag and hands a non-dynamic or unknown target to a document load without a descriptor request (decision 7 as rewritten, and decision 8).

> The opt-out (`dynamic: false`) case reaches the same floor — the client never learns the flag, the server answers the document, and the unparseable body falls back.

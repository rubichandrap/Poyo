# Archived text from ADR 0009

Superseded by ADR 0019. Kept verbatim so the history of the decision stays readable; the current decision is in [`../0009-dynamic-navigation.md`](../0009-dynamic-navigation.md).

if the current URL was reached by `push`/`replace`, browser Back/Forward fetch a descriptor and swap the page (`popstate` path only); otherwise traversal is the ordinary document load. *Superseded in part by ADR 0019: the "otherwise" clause assumed `popstate` fires for entries of other documents, which it does not; every same-document entry is now traversed through the descriptor.*

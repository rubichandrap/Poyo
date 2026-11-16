# Every same-document history entry is traversable

**Status**: Accepted. Supersedes the cold-entry clause of ADR 0009 decision 2 ("otherwise traversal is the ordinary document load").

ADR 0009 made traversal depend on history state: an entry reached by `push`/`replace` carries Poyo state and is traversed through the descriptor; any other entry is a "cold entry" and the router answers its `popstate` with a document load. That rests on a claim about the platform that is false. The browser fires `popstate` only when it moves between two entries of the **same document**; moving to an entry that belongs to another document is a document load the browser performs itself, and no script runs to intercept it. So every entry that reached the cold-entry branch belonged to the document already loaded — the entry the document was loaded into, an in-page `#anchor` entry, or an entry another library pushed — and the router reloaded the page for an entry it could have swapped. Back to the landing page reloaded the whole application.

The tests did not catch it because they shared the assumption: the history harness dispatched `popstate` for any entry the test chose, including ones a real browser never would. An exhaustive model check of the router against a simulated browser that models same-document traversal (`packages/poyo/test/navigation-model.test.ts`) found it in three steps, and a real-browser check (`scripts/browser-navigation.mjs`) now pins it.

**Decision**:

1. The entry a document is loaded into is adopted when the router installs: it gains a scroll record like any entry the router writes.
2. A `popstate` for a hash-only change, or for a same-URL entry the router did not write, never enters the machinery — the browser or the owning library handles it; the entry is adopted so its scroll is recorded.
3. Every other `popstate` is traversed through the descriptor, whether or not the entry carries Poyo state. An entry without a scroll record shows its page from the top.
4. Scroll is recorded only while the page on screen is the current entry's page — never between a traversal's `popstate` and its commit, when the browser already points at the destination while the outgoing page is shown.
5. Cross-document traversal stays the browser's ordinary document load. It is not a fallback the router chooses; it is the case the router never sees.

**Process consequence**: a decision that rests on platform behavior names the test that exercises that behavior in the platform, or in a model of it that is checked against the platform. A mock that encodes the decision's own assumption is not evidence for it. ADR 0009's claim had no such test; this one cites the model check and the browser check.

**Consequences**: Back/Forward never reloads the loaded document; one fewer request per traversal to the landing page; a `push` no longer copies the outgoing entry's state keys into the new entry (`replace` keeps them); `replace` scrolls to the top, matching the scroll record it writes. A known limit: an entry another library pushes and the user never scrolls on gives the router no moment to record it (`pushState` has no event), so it returns at the top.

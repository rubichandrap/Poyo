# 01: Record ADR 0012 for Unified Page Data Production

**What to build:** Document the architectural decision consolidating Page data production strictly into the Server core via `this.PoyoPage(data)` and `@Html.PoyoPageData()`. Formally supersede ADR 0005's `ViewBag.ServerData` channel claim, define the object-only shape invariant, and eliminate reverse-parsing HTML scraping as a supported navigation mechanism.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `docs/adr/0012-unified-page-data-production.md` is created following the repository's ADR format.
- [x] The ADR explicitly records that Page data is controller-authored and object-only.
- [x] The ADR explicitly supersedes ADR 0005's claim that `ViewBag.ServerData` is the server data channel.
- [x] The ADR documents safe script embedding via `@Html.PoyoPageData()`, non-executing view availability guards (404), and the deletion of layout text scraping.

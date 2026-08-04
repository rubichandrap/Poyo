# 02 — CLI writes the v2 registry (access model)

**What to build:** The Route manager writes and validates the v2 registry: a single `access` field (`public` | `guest` | `protected`, default `protected`) replaces `isPublic`/`isGuestOnly`. `--public`/`--guest` flags map onto it. Six invariants enforced on every write/read: path non-empty with leading slash and case-insensitive uniqueness; name non-empty without edge slashes; files present and well-formed; access in the enum; controller implies action (and vice versa); unknown fields rejected — legacy `isPublic`/`isGuestOnly` are unknown fields and must be rejected, not migrated. No migration shim, no version marker. Verified through the existing subprocess CLI seam (temp fixture projects): commands write valid v2 registries and reject invalid hand-edits loudly.

**Blocked by:** None — can start immediately

**Status:** done

- [x] `poyo route add` and `route update` write `access` (default protected; `--public`/`--guest` map to it)
- [x] Invalid access value rejected with a clear CliError
- [x] `--controller` requires `--action` (existing rule retained)
- [x] Registry with legacy `isPublic`/`isGuestOnly` rejected by CLI commands as unknown fields
- [x] Registry with duplicate case-insensitive paths, bad names, or bad files fields rejected
- [x] Unknown fields rejected on read
- [x] CLI tests cover the above on the existing fixture seam

GitHub: https://github.com/rubichandrap/Poyo/issues/18

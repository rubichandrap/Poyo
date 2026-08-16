# 01 — Client runtime subpath in the framework package (usePage)

**What to build:** The framework package @rubichandrap/poyo ships its client runtime API as a subpath export ./runtime, starting with usePage — the accessor for server-injected page data — plus the Window.SERVER_DATA typing. Anyone can import { usePage } from "@rubichandrap/poyo/runtime" and read typed page data with SSR safety, the way Next.js ships useRouter from next/router.

**Blocked by:** None — can start immediately

**Status:** done — PR #29

- [x] @rubichandrap/poyo exposes "./runtime" with usePage<T extends object = Record<string, unknown>>(): T | null (SSR guard; null for missing/null/array/primitive SERVER_DATA; plain object → payload)
- [x] The package declares Window.SERVER_DATA?: unknown globally (upgraded from any)
- [x] react declared as peerDependency; the runtime module stays dependency-free and browser-safe
- [x] Unit tests in the framework package cover the accessor contract and pass

GitHub: https://github.com/rubichandrap/Poyo/issues/24

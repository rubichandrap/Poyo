# 04 — Home normalization + fallback cleanup

**What to build:** Home becomes a normal registry route: served by the framework's page controller with `access: guest` and SEO declared in the registry. HomeController (including its dead Error action) is deleted, and the registry skip for Home is removed. The fallback default route loses its Home defaults (`{controller}/{action}/{id?}`), so unmatched URLs get clean 404s instead of falling through to a deleted controller. The client's `/home -> /` URL mapping is removed (dead once `/Home` no longer exists). No Error page is added. Verified end-to-end: `/` serves the guest landing page; authenticated users are redirected away from it; `/Home` and unmatched URLs return clean 404s.

**Blocked by:** 02 — CLI writes the v2 registry; 03 — Contract cut: v2 template registry + universal access enforcement

**Status:** done

- [x] Home is a normal registry route (access: guest, seo in registry)
- [x] HomeController deleted; no Error.cshtml added
- [x] Registry skip for Home removed
- [x] Fallback default route has no Home defaults; unmatched URLs 404 cleanly
- [x] Client `/home -> /` mapping removed
- [x] HTTP tests cover `/` guest behavior and 404 cases

GitHub: https://github.com/rubichandrap/Poyo/issues/20

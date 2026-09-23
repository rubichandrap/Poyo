# 06 — Fixture e2e: the dynamic-navigation seam

**What to build:** The release fixture grows the assertions that prove the whole feature on a real scaffolded project, at the highest seam: the scaffolded server compiles the framework's server core straight from the installed package; a descriptor request against the reference route answers the JSON descriptor (canonical page name, registry SEO, injected page data) with the navigation-aware `Vary` header; the opted-out route answers the document; the protected route's descriptor challenges without authentication (a redirect/401, never a leaked payload); the built client bundle carries the router, `Link`, and the runtime-owned typed route helper; the committed tree has no route manifest and no client index HTML. New assertions are expected red until the next release version is published, per the fixture's established convention.

**Blocked by:** 02 — The registry learns `dynamic`; 03 — Manifest encapsulation; 04 — Dynamic navigation; 05 — Traversal

**Status:** ready-for-agent

- [ ] The fixture scaffold's server build succeeds with the framework source compiled from the installed package (no in-tree framework copies)
- [ ] A descriptor request (navigation header) answers JSON `{name, seo, pageData}` with `Vary: <navigation header>`; the payload matches what the document injects
- [ ] The opted-out route answers the document for a descriptor request; the field survives the scaffolder's rename untouched
- [ ] The protected route challenges an anonymous descriptor request (no payload leak)
- [ ] The built bundle carries the router surface and the runtime route helper; the bundle-anchoring follows the existing minifier-stable proof pattern
- [ ] The fixture asserts the absence of the committed manifest and the client index HTML in the generated project

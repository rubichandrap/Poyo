# Controller `ViewData["Title"]` and dynamic-navigation SEO

## Assessment

**The proposed raw `ViewData["Title"]` overlay is not a complete or sufficiently explicit change.** It would repair the mismatch for a title deliberately assigned by a custom controller, but it would turn a weakly typed MVC transport key into a second, hidden SEO source without establishing one canonical effective title for both representations.

`PageResult` does **not** ignore controller `ViewData`: it carries the controller's `ViewDataDictionary` into normal Razor rendering. It ignores controller-modified `ViewData` only when constructing the navigation descriptor, because that branch serializes the registry's `SeoModel` directly.

The minimal, internally consistent recommendation is to keep `routes.json` authoritative. If request-dependent titles are required, support them through an explicit, typed SEO override on the page-result seam and use that one effective SEO value for both the document and descriptor. Do not make an arbitrary `ViewData["Title"]` write the public SEO override contract.

## Current local behavior

### Server request lifecycle

1. `AddPoyo` installs `SeoPolicyFilter` as a global MVC action filter (`packages/poyo/server/PoyoExtensions.cs:35-41`).
2. Before the action runs, `SeoPolicyFilter` resolves the registry route and writes:
   - `ViewData["Title"] = seo?.Title ?? route.Name`
   - `ViewData["Description"] = seo?.Description`
   - `ViewData["MetaTags"]`
   - `ViewData["JsonLd"]`

   See `packages/poyo/server/SeoPolicyFilter.cs:21-38`.
3. `OnActionExecuting` runs before the action method. Therefore, a custom controller can subsequently assign `ViewData["Title"]` and replace the filter's value. The filter's empty `OnActionExecuted` does not restore registry SEO (`packages/poyo/server/SeoPolicyFilter.cs:41-43`).
4. `PoyoPage(...)` resolves the route and creates a `PageResult` (`packages/poyo/server/ControllerExtensions.cs:24-30`). `PageResult.Create` assigns the same live `controller.ViewData` dictionary and `TempData` to the `ViewResult` (`packages/poyo/server/PageResult.cs:78-96`).
5. For an ordinary document request, `PageResult` delegates to `base.ExecuteResultAsync` (`packages/poyo/server/PageResult.cs:148-166`). The shared layout reads the current `ViewBag.Title` and renders `<title>@ViewBag.Title - Poyo</title>` (`packages/poyo-template/Poyo.Server/Views/Shared/_Layout.cshtml:6-14`).

Consequently, on a normal MVC document request, a custom controller's `ViewData["Title"] = "Dynamic title"` wins over the value initially assigned by `SeoPolicyFilter`, and the response title is `Dynamic title - Poyo`. `ViewData["Title"]` has no special ASP.NET Core SEO behavior; it works here because Poyo's layout chooses to read that weakly typed key.

This is standard MVC data flow: Microsoft documents `ViewData`/`ViewBag` as the same underlying collection for passing data from controllers to views and layouts, and the layout example reads the title from `ViewData["Title"]`:

- https://learn.microsoft.com/en-us/aspnet/core/mvc/views/overview?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.mvc.filters.iactionfilter?view=aspnetcore-10.0

### Descriptor behavior

For a request carrying `X-Poyo-Navigation: 1` on a dynamic route, `PageResult` takes its descriptor branch (`packages/poyo/server/PageResult.cs:152-161`). It checks only that the view can be found, then constructs:

```text
new PageDescriptor(_route.Name, _route.Seo, _explicitPageData)
```

See `packages/poyo/server/PageResult.cs:168-184`. `PageDescriptor` itself contains the route name, registry `SeoModel`, and page data (`packages/poyo/server/PageDescriptor.cs:3-10`). No `ViewData["Title"]` participates.

The descriptor branch also does **not** execute Razor. `FindView` only resolves the view file (`packages/poyo/server/PageResult.cs:187-203`). It therefore cannot observe a later `ViewBag.Title` assignment made by the view.

The current tests explicitly lock descriptor SEO to the registry value (`packages/poyo-template/Poyo.Server.Tests/DescriptorContractTests.cs:145-152`).

### Client behavior

The client descriptor contract accepts registry-shaped `seo.title` and `seo.description` (`packages/poyo/src/runtime/router.ts:14-23`). During dynamic navigation, `applySeoAndAccessibility`:

- assigns `doc.title = body.seo.title` when the title is truthy;
- creates or updates the description meta element;
- does not apply `seo.meta` or `seo.jsonLd`;
- falls back to `doc.title = body.name` when `seo` is absent;
- uses the chosen title for its accessibility announcement.

See `packages/poyo/src/runtime/router.ts:122-177`. The same function is used for push/replace and traversed client navigation (`packages/poyo/src/runtime/router.ts:338-370`, `packages/poyo/src/runtime/router.ts:421-428`). Its title behavior is covered by `packages/poyo/test/navigation.test.ts:499-569`.

The HTML Standard defines `document.title` as the document title and says assigning it updates the document title. Setting it therefore immediately changes the DOM title and browser-visible title, not merely Poyo state:

- https://html.spec.whatwg.org/multipage/dom.html#dom-document-title

### Current representation summary

| Stage | Title source |
|---|---|
| Filter, before action | `routes.json` title, else route name |
| Custom controller action | May replace shared `ViewData["Title"]` |
| Normal document | Current `ViewBag.Title`, then layout appends ` - Poyo` |
| Navigation descriptor | Raw `_route.Seo`; client falls back to route name when `seo` is absent |
| Dynamic navigation | Uses truthy `descriptor.seo.title`; when `seo` is absent, uses `descriptor.name` |

There are therefore two existing representation differences even without a controller override:

1. Normal HTML appends the site suffix, while dynamic navigation assigns the raw descriptor title.
2. A view-level title assignment can affect normal HTML but cannot affect the descriptor.

The second point is active in the repository's scaffolding code: generated views still assign `ViewBag.Title = "${name}"` (`packages/poyo/src/templates.ts:24-30`), and the scaffolder writes that template (`packages/poyo/src/scaffold.ts:105-126`). The checked-in template views do not make that assignment, but newly generated routes can.

## SEO validation and serialization

The server owns the strongly typed route model. `RouteDefinition.Seo` is a nullable `SeoModel` (`packages/poyo/server/RouteDefinition.cs:16-24`), whose title and description are nullable strings, meta is a string dictionary, and JSON-LD is a `JsonElement` (`packages/poyo/server/SeoModel.cs:9-13`). `RoutePolicy` eagerly deserializes the registry with case-insensitive names, disallows unmapped members, and strictly converts access enum values (`packages/poyo/server/RoutePolicy.cs:14-19`, `packages/poyo/server/RoutePolicy.cs:30-49`).

The CLI's TypeScript interface marks `title` and `description` as required strings (`packages/poyo/src/routes.ts:8-13`), but runtime CLI validation only checks that `seo` itself is an object (`packages/poyo/src/registry.ts:120-125`). Detailed JSON value validation is therefore primarily supplied by the server's typed deserialization/boot failure, not by the CLI validator.

Descriptor serialization uses camelCase naming and does not configure null omission (`packages/poyo/server/PageResult.cs:26-34`). Thus the descriptor preserves a nullable SEO object and typed null fields. A raw `ViewData["Title"]` overlay would bypass registry validation: MVC permits any object there, while `SeoModel.Title` is a `string?`; empty, null, and non-string values therefore need explicit precedence rules.

## Is the proposed overlay correct?

### What it gets right

If an application deliberately sets a string `ViewData["Title"]` in a custom controller, that value does affect the normal Poyo document. Using the same value in `PageDescriptor.Seo.Title` would make client-side navigation reflect the controller's intended browser title instead of reverting to the registry title.

### Why it is not correct as stated

1. **It formalizes two sources of truth.** Poyo currently documents `routes.json` as the SEO policy and the route name as its default title (`AGENTS.md:68-72`). A magic key that silently wins later changes that contract without making the precedence obvious.

2. **`ViewData` cannot distinguish an explicit controller override from Poyo's own filter default.** The filter has already populated `"Title"` before the action runs. Any overlay must either always treat that value as an override, track whether the action changed it, or reconstruct registry defaults. Each choice is a new contract.

3. **It does not capture every normal-document title override.** Descriptor generation never runs the view, while the repository's generated view template writes `ViewBag.Title`. A controller-only overlay leaves a known document/descriptor split.

4. **It does not capture the effective document title.** The layout appends ` - Poyo`; the client currently assigns the raw descriptor title. A controller value of `Dynamic title` would yield `Dynamic title - Poyo` on a document load and `Dynamic title` after client navigation.

5. **It changes the descriptor shape and validation model.** An absent registry `seo` currently yields `seo: null`, and the client already falls back to `name`. Synthesizing an SEO object merely because `ViewData["Title"]` contains the filter's default would change the wire representation without improving the resulting title.

6. **The motivation should be representation consistency, not a claimed ranking shortcut.** Google permits JavaScript to set or change titles, but that fact does not make an arbitrary framework key canonical or make search outcomes deterministic.

## Google Search guidance

Google's current Search Central guidance supports these narrower conclusions:

- Google explicitly says JavaScript may set or change the `<title>` element. It also describes a crawl → render → index pipeline, queues 200 responses for rendering, and says Google uses the rendered HTML to index the page. It nevertheless recommends server-side or pre-rendering because it is faster and not every bot runs JavaScript. The same page recommends real `<a href>` links and the History API for single-page routing.  
  https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- A title link is generated automatically from several sources, including `<title>`, the visual title, headings, `og:title`, and other page/reference text. Google may rewrite an inaccurate title, and notices changes only after recrawling and reprocessing, which may take days to weeks.  
  https://developers.google.com/search/docs/appearance/title-link
- Google says it does not guarantee that it will crawl, index, or serve a page. Indexing depends on content and metadata, and ranking uses many automated factors. A descriptive, unique title helps users and search systems identify the result, but it does not guarantee ranking or indexing.  
  https://developers.google.com/search/docs/fundamentals/how-search-works

For Poyo, a direct crawler request has no `X-Poyo-Navigation: 1`, so `PageResult` serves the normal document response (`packages/poyo/server/PageResult.cs:142-165`). Poyo's `Link` still renders a real anchor with `href` (`packages/poyo/src/runtime/link.tsx:78-109`), which is compatible with Google's crawlable-link guidance. The search path therefore normally sees the normal server response for each URL. A user's `document.title` update during a client-side session is immediate browser/UI behavior; it is not a direct notification to Search and is not a guarantee that Google will discover, crawl, index, or rank the route.

## Recommendation

**Do not implement the raw `ViewData["Title"]` overlay as an SEO rule.** Choose one coherent contract:

1. **Preferred minimal contract:** `routes.json` remains the single SEO authority. Controller/view metadata should not silently redefine SEO. If registry authority must be absolute, enforce it consistently rather than teaching the descriptor to mirror a mutable layout transport key.
2. **If request-dependent SEO is a real requirement:** add an explicit typed override at the `PoyoPage`/page-result seam (for example, an optional per-request SEO value), compute one effective SEO model in one place, and feed that same model to both document and descriptor. Define whether the wire title is the base title or the fully formatted browser title, validate it as a non-empty string, and remove/avoid alternate view-level title authoring.

Whichever contract is selected, add coverage for normal document rendering, descriptor serialization, and client title application. The current descriptor SEO test and client navigation test do not cover controller overrides.

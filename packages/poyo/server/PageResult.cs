using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.AspNetCore.Mvc.ViewEngines;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.Extensions.DependencyInjection;

namespace Poyo.Framework;

/// <summary>
/// The single result type for registry pages: a ViewResult that also speaks
/// the dynamic-navigation wire contract. A request carrying the navigation
/// header is answered with the JSON page descriptor ({ name, seo, pageData })
/// instead of the document; every other request renders the document exactly
/// as a plain ViewResult would. Access enforcement happens in the
/// RouteAccessFilter before this result runs, so a protected route never
/// leaks its payload through a descriptor.
/// </summary>
public sealed class PageResult : ViewResult
{
    /// <summary>The dynamic-navigation request header (wire contract).</summary>
    public const string NavigationHeaderName = "X-Poyo-Navigation";

    /// <summary>The dynamic-navigation request header value (wire contract).</summary>
    public const string NavigationHeaderValue = "1";

    private static readonly JsonSerializerOptions DescriptorJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly RouteDefinition? _route;
    private readonly string? _explicitPageData;

    private PageResult(RouteDefinition? route, string? explicitPageData)
    {
        _route = route;
        _explicitPageData = explicitPageData;
    }

    /// <summary>
    /// Builds the page result for a registry route — or for a non-registry
    /// fallback, when <paramref name="route"/> is null and the result behaves
    /// as a plain ViewResult. <paramref name="explicitPageData"/> is the
    /// pre-serialized window.SERVER_DATA payload supplied by custom
    /// controllers (see ControllerExtensions.PoyoPage); when absent, the
    /// descriptor harvests the document's own window.SERVER_DATA payload so
    /// the document and the descriptor carry the same bytes.
    /// </summary>
    public static PageResult For(
        Controller controller,
        string? viewPath,
        RouteDefinition? route,
        string? explicitPageData = null)
    {
        var result = new PageResult(route, explicitPageData)
        {
            ViewName = viewPath ?? route?.Files.View,
            ViewData = controller.ViewData,
            TempData = controller.TempData,
        };

        if (explicitPageData is not null)
        {
            // PoyoPage(data): the controller-provided payload is the document's
            // window.SERVER_DATA and the descriptor's pageData alike — one
            // serialization for both representations. A view assigning
            // ViewBag.ServerData would overwrite it, which custom controllers
            // using PoyoPage should treat as theirs to avoid.
            result.ViewData["ServerData"] = explicitPageData;
        }

        return result;
    }

    /// <summary>Whether the request asks for the page descriptor.</summary>
    public static bool IsDescriptorRequest(HttpRequest request)
    {
        return request.Headers.TryGetValue(NavigationHeaderName, out var value)
            && string.Equals(value, NavigationHeaderValue, StringComparison.Ordinal);
    }

    public override async Task ExecuteResultAsync(ActionContext context)
    {
        var response = context.HttpContext.Response;

        if (_route is not null)
        {
            // The same URL answers two representations (document and
            // descriptor); caches must key on the distinguishing header.
            response.Headers.Vary = NavigationHeaderName;

            if (IsDescriptorRequest(context.HttpContext.Request) && _route.Dynamic)
            {
                await ExecuteDescriptorAsync(context);
                return;
            }
        }

        await base.ExecuteResultAsync(context);
    }

    private async Task ExecuteDescriptorAsync(ActionContext context)
    {
        var response = context.HttpContext.Response;

        var pageDataJson = _explicitPageData;
        if (pageDataJson is null)
        {
            // Render the view into a discard writer purely to collect the
            // window.SERVER_DATA payload the document would carry. The render
            // is the only source: Razor executes the page against its own
            // view-data copy, so a write the view makes to ViewBag never comes
            // back on this result. The harvest validates each candidate as
            // JSON, so a payload may contain any character — including ';'.
            // A missing view is a missing page: not found, not a server error.
            var view = FindView(context);
            if (view is null)
            {
                response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            var rendered = new StringWriter();
            await view.RenderAsync(CreateViewContext(context, view, rendered));
            pageDataJson = ExtractServerData(rendered.ToString());
        }

        var descriptor = new PageDescriptor(
            _route!.Name,
            _route.Seo,
            ParsePageData(pageDataJson));

        response.ContentType = "application/json; charset=utf-8";
        await response.WriteAsync(JsonSerializer.Serialize(descriptor, DescriptorJsonOptions));
    }

    /// <summary>
    /// Reads the window.SERVER_DATA JSON literal out of a rendered document —
    /// the assignment the layout template emits. Each candidate between the
    /// marker and the closing script tag is JSON-validated, so a payload that
    /// itself contains characters like ';' or '}' survives intact; the first
    /// candidate that parses is the payload. Returns null when the document
    /// carries no server data.
    /// </summary>
    private static string? ExtractServerData(string rendered)
    {
        const string marker = "window.SERVER_DATA = ";
        const string terminator = "</script>";

        var start = rendered.IndexOf(marker, StringComparison.Ordinal);
        if (start < 0)
        {
            return null;
        }

        start += marker.Length;
        var searchFrom = start;
        while (searchFrom >= 0)
        {
            var end = rendered.IndexOf(terminator, searchFrom, StringComparison.Ordinal);
            if (end < 0)
            {
                return null;
            }

            var candidate = rendered[start..end].Trim();
            if (candidate.EndsWith(';'))
            {
                candidate = candidate[..^1].TrimEnd();
            }

            if (candidate.Length > 0 && PoyoJson.IsValid(candidate))
            {
                return candidate;
            }

            // Not a payload — could be a later script block; keep looking.
            searchFrom = end + terminator.Length;
        }

        return null;
    }

    private IView? FindView(ActionContext context)
    {
        var viewName = ViewName;
        if (string.IsNullOrEmpty(viewName))
        {
            return null;
        }

        // Same resolution order as the ViewResult executor: first as an
        // absolute or application-relative path, then as a name looked up in
        // the view locations.
        var viewEngine = context.HttpContext.RequestServices
            .GetRequiredService<ICompositeViewEngine>();
        var found = viewEngine.GetView(executingFilePath: null, viewName, isMainPage: true);
        if (!found.Success)
        {
            found = viewEngine.FindView(context, viewName, isMainPage: true);
        }

        return found.View;
    }

    private ViewContext CreateViewContext(ActionContext context, IView view, TextWriter writer)
    {
        var tempDataProvider = context.HttpContext.RequestServices
            .GetRequiredService<ITempDataProvider>();
        var tempData = new TempDataDictionary(context.HttpContext, tempDataProvider);

        return new ViewContext(
            context,
            view,
            ViewData ?? new ViewDataDictionary(new EmptyModelMetadataProvider(), new ModelStateDictionary()),
            tempData,
            writer,
            new HtmlHelperOptions());
    }

    private static JsonElement? ParsePageData(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        // JsonElement preserves the source bytes (raw number text, original
        // member order, original escaping), so the descriptor's pageData is
        // byte-identical to what the document injects into
        // window.SERVER_DATA.
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}

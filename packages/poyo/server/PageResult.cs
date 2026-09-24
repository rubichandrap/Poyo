using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.AspNetCore.Mvc.ViewEngines;
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

    private static readonly JsonSerializerOptions PageDataJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly RouteDefinition? _route;
    private readonly JsonElement? _explicitPageData;

    private PageResult(RouteDefinition? route, JsonElement? explicitPageData)
    {
        _route = route;
        _explicitPageData = explicitPageData;
    }

    /// <summary>
    /// Builds the page result for a registry route — or for a non-registry
    /// fallback, when <paramref name="route"/> is null and the result behaves
    /// as a plain ViewResult. <paramref name="explicitPageData"/> is a
    /// pre-serialized JSON object supplied by custom controllers; when absent,
    /// the descriptor carries no Page data.
    /// </summary>
    public static PageResult For(
        Controller controller,
        string? viewPath,
        RouteDefinition? route,
        string? explicitPageData = null)
    {
        return Create(
            controller,
            viewPath,
            route,
            NormalizePageData(explicitPageData, nameof(explicitPageData)));
    }

    internal static PageResult ForPageData(
        Controller controller,
        string? viewPath,
        RouteDefinition? route,
        object? pageData)
    {
        return Create(
            controller,
            viewPath,
            route,
            NormalizePageData(pageData, nameof(pageData)));
    }

    private static PageResult Create(
        Controller controller,
        string? viewPath,
        RouteDefinition? route,
        JsonElement? explicitPageData)
    {
        var result = new PageResult(route, explicitPageData)
        {
            ViewName = viewPath ?? route?.Files.View,
            ViewData = controller.ViewData,
            TempData = controller.TempData,
        };

        if (explicitPageData is not null)
        {
            result.ViewData[HtmlHelperExtensions.PageDataViewDataKey] = explicitPageData.Value;
        }

        return result;
    }

    private static JsonElement? NormalizePageData(object? pageData, string parameterName)
    {
        if (pageData is null)
        {
            return null;
        }

        JsonElement element;
        if (pageData is JsonElement jsonElement)
        {
            element = jsonElement.Clone();
        }
        else if (pageData is string json)
        {
            try
            {
                using var document = JsonDocument.Parse(json);
                element = document.RootElement.Clone();
            }
            catch (JsonException exception)
            {
                throw new ArgumentException(
                    "Page data strings must contain a JSON object.",
                    parameterName,
                    exception);
            }
        }
        else
        {
            element = JsonSerializer.SerializeToElement(pageData, PageDataJsonOptions);
        }

        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new ArgumentException(
                "Page data must be a JSON object or null.",
                parameterName);
        }

        return element;
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
        var view = FindView(context);
        if (view is null)
        {
            context.HttpContext.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var response = context.HttpContext.Response;
        var descriptor = new PageDescriptor(
            _route!.Name,
            _route.Seo,
            _explicitPageData);

        response.ContentType = "application/json; charset=utf-8";
        await response.WriteAsync(JsonSerializer.Serialize(descriptor, DescriptorJsonOptions));
    }

    private IView? FindView(ActionContext context)
    {
        var viewName = ViewName;
        if (string.IsNullOrEmpty(viewName))
        {
            return null;
        }

        var viewEngine = context.HttpContext.RequestServices
            .GetRequiredService<ICompositeViewEngine>();
        var found = viewEngine.FindView(context, viewName, isMainPage: true);
        if (!found.Success)
        {
            found = viewEngine.GetView(executingFilePath: null, viewName, isMainPage: true);
        }

        return found.View;
    }
}

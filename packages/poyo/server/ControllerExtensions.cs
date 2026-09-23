using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Poyo.Framework;

/// <summary>
/// Controller ergonomics for custom controllers serving registry routes:
/// PoyoPage joins the dynamic-navigation wire contract while keeping the
/// controller's own view and data.
/// </summary>
public static class ControllerExtensions
{
    private static readonly JsonSerializerOptions PageDataJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    /// <summary>
    /// Builds the page result for a custom controller action. The view path,
    /// page name, and SEO resolve from the registry route for the request
    /// path; <paramref name="pageData"/> becomes window.SERVER_DATA on the
    /// document and the pageData of the navigation descriptor — one
    /// serialization for both representations. A string must be pre-serialized
    /// JSON (an invalid one throws, rather than reaching the client as broken
    /// data); any other object is serialized with camelCase property names.
    /// For a path outside the registry, the result falls back to plain view
    /// rendering.
    /// </summary>
    public static PageResult PoyoPage(this Controller controller, object? pageData = null)
    {
        var explicitPageData = pageData switch
        {
            null => null,
            string json => PoyoJson.IsValid(json)
                ? json
                : throw new ArgumentException(
                    "PoyoPage treats a string as pre-serialized JSON; pass an object to serialize, or a JSON string.",
                    nameof(pageData)),
            _ => JsonSerializer.Serialize(pageData, PageDataJsonOptions),
        };

        var policy = controller.HttpContext.RequestServices.GetRequiredService<RoutePolicy>();
        var route = policy.Find(controller.HttpContext.Request.Path.Value ?? string.Empty);

        return PageResult.For(controller, route?.Files.View, route, explicitPageData);
    }
}

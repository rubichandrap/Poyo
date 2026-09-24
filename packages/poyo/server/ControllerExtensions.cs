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
    /// document and the pageData of the navigation descriptor — the same
    /// structured Page data value. Data must be a JSON object or
    /// null. A string must contain a pre-serialized JSON object; other objects
    /// are serialized with camelCase property names. For a path outside the
    /// registry, the result falls back to plain view rendering.
    /// </summary>
    public static PageResult PoyoPage(this Controller controller, object? pageData = null)
    {
        var explicitPageData = NormalizePageData(pageData);
        var policy = controller.HttpContext.RequestServices.GetRequiredService<RoutePolicy>();
        var route = policy.Find(controller.HttpContext.Request.Path.Value ?? string.Empty);

        return PageResult.For(controller, route?.Files.View, route, explicitPageData);
    }

    private static JsonElement? NormalizePageData(object? pageData)
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
                    "PoyoPage treats a string as pre-serialized JSON; pass an object to serialize, or a JSON object string.",
                    nameof(pageData),
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
                "PoyoPage page data must be a JSON object or null.",
                nameof(pageData));
        }

        return element;
    }
}

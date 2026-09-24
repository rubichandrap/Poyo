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
    /// <summary>
    /// Builds the page result for a custom controller action. The view path,
    /// page name, and SEO resolve from the registry route for the request
    /// path; <paramref name="pageData"/> becomes window.SERVER_DATA on the
    /// document and the pageData of the navigation descriptor — the same
    /// structured value for this controller-produced result. A later request
    /// can produce fresh time-varying fields. Data must be a JSON object or
    /// null. A string must contain a pre-serialized JSON object; other objects
    /// are serialized with camelCase property names. For a path outside the
    /// registry, the result falls back to plain view rendering.
    /// </summary>
    public static PageResult PoyoPage(this Controller controller, object? pageData = null)
    {
        var policy = controller.HttpContext.RequestServices.GetRequiredService<RoutePolicy>();
        var route = policy.Find(controller.HttpContext.Request.Path.Value ?? string.Empty);

        return PageResult.ForPageData(controller, route?.Files.View, route, pageData);
    }
}

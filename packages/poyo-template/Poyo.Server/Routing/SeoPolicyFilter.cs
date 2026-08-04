using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Poyo.Server.Routing;

/// <summary>
/// Applies the registry SEO for the current route to every view, with
/// the route name as the default title. Runs for default and custom
/// controller routes alike.
/// </summary>
public sealed class SeoPolicyFilter : IActionFilter
{
    private readonly RoutePolicy _policy;

    public SeoPolicyFilter(RoutePolicy policy)
    {
        _policy = policy;
    }

    public void OnActionExecuting(ActionExecutingContext context)
    {
        var route = _policy.Find(context.HttpContext.Request.Path.Value ?? string.Empty);

        if (route is null || context.Controller is not Controller controller)
        {
            return;
        }

        var seo = route.Seo;
        controller.ViewData["Title"] = seo?.Title ?? route.Name;
        controller.ViewData["Description"] = seo?.Description;
        controller.ViewData["MetaTags"] = seo?.Meta ?? new Dictionary<string, string>();
        controller.ViewData["JsonLd"] = seo?.JsonLd?.ToString();
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
    }
}

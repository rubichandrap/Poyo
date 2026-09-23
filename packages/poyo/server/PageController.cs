using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Poyo.Framework;

/// <summary>
/// Serves every registry page. For a registry route, renders the registry's
/// view file or, on a descriptor request, the JSON page descriptor; custom
/// controllers keep their own actions and can use ControllerExtensions.
/// PoyoPage to join the wire contract.
/// </summary>
public sealed class PageController : Controller
{
    public IActionResult Index(string? viewPath)
    {
        var policy = HttpContext.RequestServices.GetRequiredService<RoutePolicy>();

        // Endpoint routing has already matched this action to a registry route
        // by viewPath; resolve the registry entry the same way the policy
        // filters do — by request path.
        var route = policy.Find(HttpContext.Request.Path);

        return PageResult.For(this, viewPath, route);
    }
}

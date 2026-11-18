using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Poyo.Framework;

/// <summary>
/// Serves every registry page. For a registry route, renders the registry's
/// view file or, on a descriptor request, the JSON page descriptor; custom
/// controllers keep their own actions and can use ControllerExtensions.
/// PoyoPage to join the wire contract. A request that reaches this action
/// without a registry route is a 404: serving the view would bypass the
/// policies the registry exists to apply.
/// </summary>
public sealed class PageController : Controller
{
    public IActionResult Index(string? viewPath)
    {
        var policy = HttpContext.RequestServices.GetRequiredService<RoutePolicy>();

        // Endpoint routing has already matched this action to a registry route
        // by viewPath; resolve the registry entry the same way the policy
        // filters do — by request path. `Path.Value` is the decoded path, which
        // is the form the registry holds; PathString's implicit string
        // conversion re-encodes it for a link, so `/Café` arrives as
        // `/Caf%C3%A9` and matches no route.
        var route = policy.Find(HttpContext.Request.Path.Value ?? string.Empty);

        if (route is null)
        {
            // Defense in depth. Endpoint routing matches a declared path as a
            // route template while every policy filter and the descriptor
            // resolve the registry literally, so a template-shaped declaration
            // could reach this action with no route behind it. The registry
            // refuses such a declaration at boot; if a request gets here, it
            // is not a page.
            return NotFound();
        }

        return PageResult.For(this, viewPath, route);
    }
}

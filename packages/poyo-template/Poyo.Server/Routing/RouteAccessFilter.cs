using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Poyo.Server.Routing;

/// <summary>
/// Universal access enforcement for every registry route. Scheme-agnostic:
/// reads only User.Identity and issues challenges through the auth pipeline,
/// so swapping the demo auth later does not touch it. Protected routes
/// challenge anonymous users (the cookie config keeps the LoginPath redirect
/// for pages and 401 for API calls); guest routes redirect authenticated
/// users to the configured landing page.
/// </summary>
public sealed class RouteAccessFilter : IAsyncResourceFilter
{
    private readonly RoutePolicy _policy;
    private readonly string _landingPath;

    public RouteAccessFilter(RoutePolicy policy, IConfiguration configuration)
    {
        _policy = policy;
        _landingPath = configuration["Routes:LandingPath"] ?? "/Dashboard";
    }

    public async Task OnResourceExecutionAsync(
        ResourceExecutingContext context,
        ResourceExecutionDelegate next)
    {
        var route = _policy.Find(context.HttpContext.Request.Path.Value ?? string.Empty);

        if (route is not null)
        {
            var isAuthenticated = context.HttpContext.User.Identity?.IsAuthenticated == true;

            if (route.Access == RouteAccess.Protected && !isAuthenticated)
            {
                context.Result = new ChallengeResult();
                return;
            }

            if (route.Access == RouteAccess.Guest && isAuthenticated)
            {
                context.Result = new RedirectResult(_landingPath);
                return;
            }
        }

        await next();
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Poyo.Framework;

/// <summary>
/// Universal access enforcement and page-response policy for every registry
/// route. Reads User.Identity for access decisions, applies the private
/// no-store policy, and issues challenges through the auth pipeline, so
/// swapping the demo auth later does not touch it. Protected routes challenge
/// anonymous users (the cookie config keeps the LoginPath redirect for pages
/// and 401 for API calls); guest routes redirect authenticated users to the
/// configured landing path.
/// </summary>
public sealed class RouteAccessFilter : IAsyncResourceFilter
{
    private readonly RoutePolicy _policy;
    private readonly string _landingPath;

    public RouteAccessFilter(RoutePolicy policy, IConfiguration configuration)
    {
        _policy = policy;
        _landingPath = AppRelative(configuration["Routes:LandingPath"] ?? "/Dashboard");
    }

    /// <summary>
    /// A root-relative landing path names a page of this application, so it
    /// resolves under the request's path base ("~/"), the way the registry's
    /// own paths do: an app hosted at /Poyo lands on /Poyo/Dashboard, not on
    /// the host's /Dashboard. Absolute URLs and "~/" paths pass through.
    /// </summary>
    private static string AppRelative(string landingPath) =>
        landingPath.StartsWith('/') && !landingPath.StartsWith("//")
            ? "~" + landingPath
            : landingPath;

    public async Task OnResourceExecutionAsync(
        ResourceExecutingContext context,
        ResourceExecutionDelegate next)
    {
        var route = _policy.Find(context.HttpContext.Request.Path.Value ?? string.Empty);

        if (route is not null)
        {
            PageResponsePolicy.ApplyPrivateNoStore(context.HttpContext.Response);
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

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Poyo.Framework;

/// <summary>
/// Registration for the Poyo server core: registry-backed route policy with
/// universal access and SEO enforcement. Pair with AddControllersWithViews
/// (in any order) and MapPoyoRoutes.
/// </summary>
public static class PoyoExtensions
{
    /// <summary>
    /// Loads the routes registry (failing startup loudly on a malformed
    /// registry), registers the route policy, and installs the universal
    /// access and SEO filters for every MVC action. The registry path comes
    /// from the explicit argument, then "Routes:JsonPath" configuration, then
    /// "routes.json" next to the app's working directory.
    /// </summary>
    public static IServiceCollection AddPoyo(
        this IServiceCollection services,
        IConfiguration configuration,
        string? registryPath = null)
    {
        var path = registryPath
            ?? configuration["Routes:JsonPath"]
            ?? Path.Combine(Directory.GetCurrentDirectory(), "routes.json");

        // Eager on purpose: a malformed registry must fail the boot at
        // service-registration time, not on the first request.
        services.AddSingleton(RoutePolicy.Load(path));

        // PostConfigure runs after the app's AddControllersWithViews options
        // regardless of call order, so the filters attach to the app's MVC.
        services.PostConfigure<MvcOptions>(options =>
        {
            options.Filters.Add<RouteAccessFilter>();
            options.Filters.Add<SeoPolicyFilter>();
        });

        return services;
    }

    /// <summary>
    /// Maps every registry route from the registered route policy. Call after
    /// MapControllers so registry pages and API controllers coexist; the
    /// conventional fallback route stays the app's choice.
    /// </summary>
    public static IEndpointRouteBuilder MapPoyoRoutes(this IEndpointRouteBuilder endpoints)
    {
        var policy = endpoints.ServiceProvider.GetRequiredService<RoutePolicy>();
        policy.MapRoutes(endpoints);
        return endpoints;
    }
}

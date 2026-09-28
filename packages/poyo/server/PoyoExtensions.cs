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
    private const string RegistryFileName = "routes.json";

    /// <summary>
    /// Loads the routes registry (failing startup loudly when the registry is
    /// absent or unusable), registers the route policy, and installs the
    /// universal access and SEO filters for every MVC action.
    /// </summary>
    /// <param name="registryPath">
    /// Where the registry lives, overriding configuration. A relative value is
    /// resolved against <paramref name="contentRootPath"/>.
    /// </param>
    /// <param name="contentRootPath">
    /// The host's content root, which resolves a relative registry path.
    /// Defaults to the application installation directory.
    /// </param>
    /// <remarks>
    /// The registry path resolves in a fixed chain: the explicit argument, then
    /// "Routes:JsonPath" configuration, then "routes.json" beside the
    /// application assembly. The process working directory is never consulted
    /// — in ASP.NET it is also the default content root, so anchoring there
    /// would make a deployment's access model depend on the directory its host
    /// happened to start it in.
    /// </remarks>
    public static IServiceCollection AddPoyo(
        this IServiceCollection services,
        IConfiguration configuration,
        string? registryPath = null,
        string? contentRootPath = null)
    {
        // Eager on purpose: a missing or malformed registry must fail the boot
        // at service-registration time, not on the first request.
        services.AddSingleton(
            RoutePolicy.Load(ResolveRegistryPath(registryPath, configuration, contentRootPath)));

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
    /// Resolves the registry path from an explicit value, then
    /// "Routes:JsonPath", then the application installation directory. Never
    /// the process working directory, and never silently: an unresolved
    /// registry fails the boot in <see cref="RoutePolicy.Load"/>.
    /// </summary>
    private static string ResolveRegistryPath(
        string? registryPath,
        IConfiguration configuration,
        string? contentRootPath)
    {
        var configured = registryPath ?? configuration["Routes:JsonPath"];

        if (string.IsNullOrWhiteSpace(configured))
        {
            return Path.Combine(AppContext.BaseDirectory, RegistryFileName);
        }

        return Path.IsPathRooted(configured)
            ? configured
            : Path.GetFullPath(configured, contentRootPath ?? AppContext.BaseDirectory);
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

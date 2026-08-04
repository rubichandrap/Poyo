using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Routing;

namespace Poyo.Server.Routing;

/// <summary>
/// The single place the server reads and interprets the routes registry.
/// Fails startup loudly when the registry violates the route schema;
/// missing view files stay a per-route runtime error.
/// </summary>
public sealed class RoutePolicy
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        Converters = { new JsonStringEnumConverter(allowIntegerValues: false) },
    };

    private readonly IReadOnlyList<RouteDefinition> _routes;

    public IReadOnlyList<RouteDefinition> Routes => _routes;

    private RoutePolicy(IReadOnlyList<RouteDefinition> routes)
    {
        _routes = routes;
    }

    public static RoutePolicy Load(string routesJsonPath)
    {
        if (!File.Exists(routesJsonPath))
        {
            return new RoutePolicy([]);
        }

        List<RouteDefinition> routes;

        try
        {
            var json = File.ReadAllText(routesJsonPath);
            routes = JsonSerializer.Deserialize<List<RouteDefinition>>(json, JsonOptions) ?? [];
        }
        catch (JsonException ex)
        {
            throw new RoutePolicyException(
                $"Routes registry '{routesJsonPath}' is not valid: {ex.Message}", ex);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new RoutePolicyException(
                $"Cannot read routes registry '{routesJsonPath}': {ex.Message}", ex);
        }

        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var route in routes)
        {
            if (!seenPaths.Add(route.Path))
            {
                throw new RoutePolicyException(
                    $"Routes registry '{routesJsonPath}' contains duplicate route path '{route.Path}'.");
            }
        }

        return new RoutePolicy(routes);
    }

    /// <summary>
    /// Finds the registry route serving the given request path, or null
    /// when the path is not a registry route (API, fallback, static).
    /// Matches like ASP.NET routing: case-insensitive, trailing slashes
    /// ignored.
    /// </summary>
    public RouteDefinition? Find(string path)
    {
        var normalized = path.TrimEnd('/');
        if (normalized.Length == 0)
        {
            normalized = "/";
        }

        return _routes.FirstOrDefault(
            r => r.Path.Equals(normalized, StringComparison.OrdinalIgnoreCase));
    }

    public void MapRoutes(IEndpointRouteBuilder endpoints)
    {
        foreach (var route in _routes)
        {
            if (route.Name.Equals("Home", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var controllerName = !string.IsNullOrWhiteSpace(route.Controller)
                ? route.Controller
                : "Page";

            var actionName = !string.IsNullOrWhiteSpace(route.Action)
                ? route.Action
                : "Index";

            endpoints.MapControllerRoute(
                name: route.Name,
                pattern: route.Path.TrimStart('/'),
                defaults: new
                {
                    controller = controllerName,
                    action = actionName,
                    viewPath = route.Files.View,
                });
        }
    }
}

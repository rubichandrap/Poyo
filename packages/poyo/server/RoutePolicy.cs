using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Routing;

namespace Poyo.Framework;

/// <summary>
/// The single place the server reads and interprets the routes registry.
/// The registry is a required deployment artifact, not content: it gates the
/// access model, the SEO policy and the private no-store guarantee, so a
/// registry that is missing, empty, unreadable or unparseable fails startup
/// loudly rather than leaving the application with no policy at all.
/// Missing view files stay a per-route runtime error.
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
        var routes = DeserializeRoutes(ReadRegistryText(routesJsonPath), routesJsonPath);

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
    /// Reads the registry, naming the state that stopped it: a missing file and
    /// an unreadable file are different deployment mistakes and get different
    /// messages.
    /// </summary>
    private static string ReadRegistryText(string routesJsonPath)
    {
        if (!File.Exists(routesJsonPath))
        {
            throw new RoutePolicyException(
                $"Routes registry '{routesJsonPath}' was not found. The registry is a required " +
                "deployment artifact: set 'Routes:JsonPath', or ship routes.json beside the application.");
        }

        string json;

        try
        {
            json = File.ReadAllText(routesJsonPath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new RoutePolicyException(
                $"Cannot read routes registry '{routesJsonPath}': {ex.Message}", ex);
        }

        if (string.IsNullOrWhiteSpace(json))
        {
            throw new RoutePolicyException(
                $"Routes registry '{routesJsonPath}' is empty: the file has no content.");
        }

        return json;
    }

    private static List<RouteDefinition> DeserializeRoutes(string json, string routesJsonPath)
    {
        List<RouteDefinition>? routes;

        try
        {
            ValidateDynamicField(json, routesJsonPath);
            routes = JsonSerializer.Deserialize<List<RouteDefinition>>(json, JsonOptions);
        }
        catch (JsonException ex)
        {
            throw new RoutePolicyException(
                $"Routes registry '{routesJsonPath}' is not valid JSON: {ex.Message}", ex);
        }

        if (routes is null || routes.Count == 0)
        {
            throw new RoutePolicyException(
                $"Routes registry '{routesJsonPath}' is empty: it declares no routes. An empty " +
                "registry switches off the access model, the SEO policy and the private no-store " +
                "guarantee, so it is a startup failure rather than a degraded mode.");
        }

        return routes;
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

    public RouteDefinition? FindForRequest(
        string path,
        string? controllerName,
        string? actionName)
    {
        return Find(path) ?? FindForControllerAction(controllerName, actionName);
    }

    private RouteDefinition? FindForControllerAction(
        string? controllerName,
        string? actionName)
    {
        if (string.IsNullOrWhiteSpace(controllerName) || string.IsNullOrWhiteSpace(actionName))
        {
            return null;
        }

        return _routes
            .Where(route =>
                GetControllerName(route).Equals(controllerName, StringComparison.OrdinalIgnoreCase)
                && GetActionName(route).Equals(actionName, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(route => AccessPriority(route.Access))
            .FirstOrDefault();
    }

    private static string GetControllerName(RouteDefinition route) =>
        string.IsNullOrWhiteSpace(route.Controller) ? "Page" : route.Controller;

    private static string GetActionName(RouteDefinition route) =>
        string.IsNullOrWhiteSpace(route.Action) ? "Index" : route.Action;

    private static int AccessPriority(RouteAccess access) => access switch
    {
        RouteAccess.Protected => 3,
        RouteAccess.Guest => 2,
        _ => 1,
    };

    public void MapRoutes(IEndpointRouteBuilder endpoints)
    {
        foreach (var route in _routes)
        {
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

    private static void ValidateDynamicField(string json, string routesJsonPath)
    {
        using var document = JsonDocument.Parse(json);
        if (document.RootElement.ValueKind != JsonValueKind.Array)
        {
            return;
        }

        foreach (var element in document.RootElement.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            if (element.TryGetProperty("dynamic", out var dynamicProp))
            {
                if (dynamicProp.ValueKind != JsonValueKind.True && dynamicProp.ValueKind != JsonValueKind.False)
                {
                    var routePath = element.TryGetProperty("path", out var pathProp) && pathProp.ValueKind == JsonValueKind.String
                        ? pathProp.GetString()
                        : "unknown";

                    throw new RoutePolicyException(
                        $"Routes registry '{routesJsonPath}' route '{routePath}' has an invalid dynamic field: expected boolean, got {dynamicProp.ValueKind}.");
                }
            }
        }
    }
}

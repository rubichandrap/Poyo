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
/// A registry whose route identities are not canonical fails the same way, and
/// a request is still matched liberally against the file it produced.
/// Missing view files stay a per-route runtime error.
/// </summary>
public sealed class RoutePolicy
{
    /// <summary>
    /// Maps a lower camel case registry onto the PascalCase model. Property
    /// matching stays case-insensitive because that is how the .NET model is
    /// spelled, not a statement about the registry: a field has exactly one
    /// accepted spelling, and <see cref="RouteSchema"/> is what says so, so a
    /// mis-cased member is refused with the route beside it rather than mapped
    /// to the member it happens to resemble.
    /// </summary>
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        Converters = { new JsonStringEnumConverter(allowIntegerValues: false) },
    };

    private readonly IReadOnlyList<RouteDefinition> _routes;
    private readonly Dictionary<string, RouteDefinition> _routesByPath;

    public IReadOnlyList<RouteDefinition> Routes => _routes;

    private RoutePolicy(IReadOnlyList<RouteDefinition> routes, string routesJsonPath)
    {
        RouteIdentity.Validate(routes, routesJsonPath);

        _routes = routes;
        _routesByPath = routes.ToDictionary(
            route => RouteIdentity.NormalizeRequestPath(route.Path),
            StringComparer.OrdinalIgnoreCase);
    }

    public static RoutePolicy Load(string routesJsonPath)
    {
        var routes = DeserializeRoutes(ReadRegistryText(routesJsonPath), routesJsonPath);

        return new RoutePolicy(routes, routesJsonPath);
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
            // File.Exists answers false for any stat failure, not only for an
            // absent file, so a registry this process cannot reach would
            // otherwise be reported as missing — the one diagnosis that sends
            // the operator looking for a file that is already there.
            if (IsUnreachable(routesJsonPath))
            {
                throw new RoutePolicyException(
                    $"Cannot read routes registry '{routesJsonPath}': the path cannot be reached. " +
                    "The registry is a required deployment artifact, so this fails the boot rather " +
                    "than leaving the application with no policy at all.");
            }

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

    /// <summary>
    /// Whether the registry's path is out of reach rather than simply absent.
    /// A directory that is not there is the ordinary "not found" case and keeps
    /// that message; only a path that exists and cannot be entered is a
    /// permission problem, and the two deserve different advice.
    /// </summary>
    private static bool IsUnreachable(string routesJsonPath)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(routesJsonPath));

        if (string.IsNullOrEmpty(directory))
        {
            return false;
        }

        try
        {
            return Directory.EnumerateFileSystemEntries(directory).GetEnumerator().MoveNext();
        }
        catch (DirectoryNotFoundException)
        {
            return false;
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            return true;
        }
    }

    private static List<RouteDefinition> DeserializeRoutes(string json, string routesJsonPath)
    {
        List<RouteDefinition>? routes;

        try
        {
            ValidateDeclaredShape(json, routesJsonPath);
            routes = JsonSerializer.Deserialize<List<RouteDefinition>>(json, JsonOptions);
        }
        catch (JsonException ex)
        {
            // One message for two failures the deserializer cannot tell us
            // apart: text that is not JSON at all, and JSON that does not fit
            // the schema (a wrong type, an SEO payload that is not the model).
            // The exception names the offending member, so the label only has
            // to be true of both.
            throw new RoutePolicyException(
                $"Routes registry '{routesJsonPath}' is not a valid routes registry: {ex.Message}", ex);
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
    /// Checks the declared shape on the raw JSON — the one spelling of every
    /// field name, the members a route must carry, and the two values whose
    /// type is part of the contract — before the deserializer sees the file.
    /// Each of those is a failure the deserializer either cannot report
    /// usefully or does not fail at all, and each is reported here where the
    /// offending route can be named.
    /// </summary>
    private static void ValidateDeclaredShape(string json, string routesJsonPath)
    {
        using var document = JsonDocument.Parse(json);
        RouteSchema.Validate(document.RootElement, routesJsonPath);
    }

    /// <summary>
    /// Finds the registry route serving the given request path, or null
    /// when the path is not a registry route (API, static, or a URL outside
    /// the registry). This is the only lookup every server seam uses to
    /// answer "which route serves this request", so the access policy, the
    /// SEO policy, the page controller and the controller extension cannot
    /// reach different conclusions about one request.
    /// Requests are matched liberally against a strict file: the path is
    /// normalized and compared case-insensitively, so a request URL the
    /// browser spelled differently still reaches the declared route.
    /// </summary>
    public RouteDefinition? Find(string path)
    {
        return _routesByPath.GetValueOrDefault(RouteIdentity.NormalizeRequestPath(path));
    }

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
}

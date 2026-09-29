namespace Poyo.Framework;

/// <summary>
/// A route's identity, defined once: the canonical form a declared path and
/// name must take, the uniqueness they must have across the registry, and the
/// normalization an incoming request path goes through before lookup.
///
/// The two halves are deliberately asymmetric. The registry is authored, and
/// three runtimes read it — the server, the framework package's route
/// manager, and the client runtime — so a declaration that is not canonical
/// would leave each of them needing its own normalizer; holding the file to
/// one form replaces all three with none. A request URL is owned by the
/// browser, so it is resolved rather than rejected. Every violation here is a
/// startup failure: in a container or under a service manager a warning is
/// invisible until a visitor reaches the broken state.
/// </summary>
public static class RouteIdentity
{
    /// <summary>
    /// Fails the boot unless every route's identity is canonical and unique.
    /// Uniqueness is checked before form: two declarations of one path are a
    /// collision whatever either of them looks like, so the collision is the
    /// more useful thing to report first.
    /// </summary>
    public static void Validate(IReadOnlyList<RouteDefinition> routes, string routesJsonPath)
    {
        AssertUnique(routes, routesJsonPath);

        foreach (var route in routes)
        {
            Validate(route, routesJsonPath);
        }
    }

    /// <summary>
    /// Fails the boot unless the route's identity is canonical: a rooted path
    /// with no trailing slash except for the root, a present name with no
    /// leading or trailing slash, and a controller and an action declared
    /// together or not at all. Every message names the offending route and the
    /// value that is wrong, because a registry with twenty entries is still
    /// easy to fix when you are told which one.
    /// </summary>
    private static void Validate(RouteDefinition route, string routesJsonPath)
    {
        ValidatePath(route, routesJsonPath);
        ValidateName(route, routesJsonPath);
        ValidateControllerAndAction(route, routesJsonPath);
    }

    /// <summary>
    /// Normalizes a path for lookup: trailing slashes are trimmed and the root
    /// path survives the trim. Case is left alone — every index and lookup
    /// that consumes this key compares case-insensitively, so one function owns
    /// the shape of a path and one comparer owns its case.
    /// </summary>
    public static string NormalizeRequestPath(string? path)
    {
        if (string.IsNullOrEmpty(path))
        {
            return "/";
        }

        var trimmed = path.TrimEnd('/');
        return trimmed.Length == 0 ? "/" : trimmed;
    }

    /// <summary>
    /// Asserts that a path and a name each claim exactly one route, ignoring
    /// case. Path keys are normalized, so a collision the raw strings would
    /// miss — differing only by case, or only by a trailing slash — is caught
    /// here instead of being served in declaration order. A name is how the
    /// client binds a navigation and an initial page, and the client's route
    /// table holds names in three structures under two tie-break rules, so two
    /// routes claiming one would resolve to different pages depending on the
    /// case of the string used to ask for it.
    ///
    /// Routes that cannot be keyed yet are left to <see cref="Validate(RouteDefinition, string)"/>,
    /// which explains the actual mistake.
    /// </summary>
    private static void AssertUnique(IReadOnlyList<RouteDefinition> routes, string routesJsonPath)
    {
        var byPath = new Dictionary<string, RouteDefinition>(StringComparer.OrdinalIgnoreCase);
        var byName = new Dictionary<string, RouteDefinition>(StringComparer.OrdinalIgnoreCase);

        foreach (var route in routes)
        {
            if (route.Path is { Length: > 0 } && route.Path.StartsWith('/'))
            {
                var key = NormalizeRequestPath(route.Path);
                if (byPath.TryGetValue(key, out var samePath))
                {
                    throw new RoutePolicyException(
                        $"{RegistryLabel(routesJsonPath)}: {Describe(route)} is the same route as " +
                        $"{Describe(samePath)} once case and a trailing slash are ignored. A route " +
                        "path is unique across the registry.");
                }

                byPath.Add(key, route);
            }

            if (!string.IsNullOrWhiteSpace(route.Name) && !byName.TryAdd(route.Name, route))
            {
                throw new RoutePolicyException(
                    $"{RegistryLabel(routesJsonPath)}: {Describe(route)} duplicates the name of " +
                    $"{Describe(byName[route.Name])}. A route name is unique across the registry, " +
                    "ignoring case.");
            }
        }
    }

    private static void ValidatePath(RouteDefinition route, string routesJsonPath)
    {
        var path = route.Path;

        if (string.IsNullOrWhiteSpace(path) || !path.StartsWith('/'))
        {
            throw new RoutePolicyException(
                $"{RegistryLabel(routesJsonPath)}: {Describe(route)} must begin with \"/\" — declare " +
                $"'{CanonicalPath(path)}' instead.");
        }

        if (path.Length > 1 && path.EndsWith('/'))
        {
            throw new RoutePolicyException(
                $"{RegistryLabel(routesJsonPath)}: {Describe(route)} declares a trailing slash — " +
                $"declare '{CanonicalPath(path)}' instead. A declared path is the URL the client " +
                "links to and the server matches, so it is stored exactly as written.");
        }
    }

    private static void ValidateName(RouteDefinition route, string routesJsonPath)
    {
        var name = route.Name;

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new RoutePolicyException(
                $"{RegistryLabel(routesJsonPath)}: {Describe(route)} has a missing or blank name. A " +
                "route's name is its identity on the server and in the client's route table.");
        }

        if (name.StartsWith('/') || name.EndsWith('/'))
        {
            throw new RoutePolicyException(
                $"{RegistryLabel(routesJsonPath)}: {Describe(route)} declares the name '{name}'. A name " +
                "must not begin or end with \"/\": it is an identifier, not a path.");
        }
    }

    private static void ValidateControllerAndAction(RouteDefinition route, string routesJsonPath)
    {
        // A declared value is one the registry names, whether or not it says
        // something: `"controller": ""` is a declaration the server cannot act
        // on, so it fails rather than reading as "not declared".
        var hasController = route.Controller is not null;
        var hasAction = route.Action is not null;

        if (hasController != hasAction)
        {
            throw new RoutePolicyException(
                $"{RegistryLabel(routesJsonPath)}: {Describe(route)} declares " +
                $"{(hasController ? "a controller" : "an action")} without the other. Declare both " +
                "or neither: a route names the action that serves it.");
        }

        if (hasController
            && (string.IsNullOrWhiteSpace(route.Controller) || string.IsNullOrWhiteSpace(route.Action)))
        {
            throw new RoutePolicyException(
                $"{RegistryLabel(routesJsonPath)}: {Describe(route)} declares a blank controller or " +
                "action. Both are non-empty values, or neither is declared.");
        }
    }

    /// <summary>
    /// The one phrase naming the registry in a failure message, shared with the
    /// schema check so a violation of the shape and a violation of the identity
    /// are read as one contract.
    /// </summary>
    internal static string RegistryLabel(string routesJsonPath) => $"Routes registry '{routesJsonPath}'";

    private static string CanonicalPath(string? path)
    {
        var rooted = string.IsNullOrWhiteSpace(path)
            ? string.Empty
            : $"/{path.Trim().TrimStart('/')}";
        var trimmed = rooted.TrimEnd('/');

        return trimmed.Length == 0 ? "/" : trimmed;
    }

    /// <summary>
    /// Identifies a route in a failure message, using whichever half of its
    /// identity is still readable: a path that is missing or blank cannot be
    /// quoted back, so the name stands in for it.
    /// </summary>
    internal static string Describe(string? path, string? name)
    {
        var route = string.IsNullOrWhiteSpace(path) ? "a route with no path" : $"route '{path}'";
        var named = string.IsNullOrWhiteSpace(name) ? string.Empty : $" (name '{name}')";

        return $"{route}{named}";
    }

    private static string Describe(RouteDefinition route) => Describe(route.Path, route.Name);
}

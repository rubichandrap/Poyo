namespace Poyo.Framework;

/// <summary>
/// A route's file paths stay inside the project. The registry is authored, and
/// the route manager resolves a declared path against the client or server
/// directory to scaffold or delete it, so a path that leaves those directories
/// is a file operation the project never asked for. The server refuses the same
/// registry at boot rather than leaving the rule to whichever command happens
/// to act on it first.
///
/// This is a containment rule, not part of a route's identity: a blank file
/// path is still served here and refused only by the route manager that
/// resolves it (ADR 0015, ADR 0018). What is judged is where the path points.
/// </summary>
internal static class RouteFilePaths
{
    /// <summary>
    /// Fails the boot unless every declared file path resolves under its
    /// project directory. Both members are judged when present: `files.react`
    /// is optional on the server, and a route that declares one is held to the
    /// same rule as its view.
    /// </summary>
    public static void Validate(IReadOnlyList<RouteDefinition> routes, string routesJsonPath)
    {
        foreach (var route in routes)
        {
            Refuse(route, "react", route.Files.React, routesJsonPath);
            Refuse(route, "view", route.Files.View, routesJsonPath);
        }
    }

    private static void Refuse(
        RouteDefinition route,
        string field,
        string? declared,
        string routesJsonPath)
    {
        if (declared is null)
        {
            return;
        }

        var refusal = Refusal(field, declared);
        if (refusal is null)
        {
            return;
        }

        throw new RoutePolicyException(
            $"{RouteIdentity.RegistryLabel(routesJsonPath)}: "
                + $"{RouteIdentity.Describe(route.Path, route.Name)} {refusal}");
    }

    /// <summary>
    /// The three ways a declared file path stops being relative to the project,
    /// judged in one order both runtimes follow: an absolute path replaces the
    /// directory it is resolved against, a drive-rooted path names a volume
    /// instead of a directory, and a `..` segment walks out of the directory.
    /// A `..` spelled with the other separator counts too, so a Windows-authored
    /// registry is refused on every platform that reads it.
    ///
    /// The wording is shared with the route manager: the corpus pins the
    /// fragments both messages must carry.
    /// </summary>
    private static string? Refusal(string field, string declared)
    {
        var named = $"\"files.{field}\"";
        const string mechanism = "a route file path is relative to the project";

        if (declared.StartsWith('/') || declared.StartsWith('\\'))
        {
            return $"declares the absolute path \"{declared}\" in {named} — {mechanism}, "
                + "so an absolute path reaches outside it.";
        }

        if (declared.Length >= 2 && char.IsAsciiLetter(declared[0]) && declared[1] == ':')
        {
            return $"declares the drive-rooted path \"{declared}\" in {named} — {mechanism}, "
                + "so a drive-rooted path reaches outside it.";
        }

        if (declared.Split('/', '\\').Contains(".."))
        {
            return $"declares the \"..\" segment in {named} — {mechanism}, "
                + "so \"..\" reaches outside it.";
        }

        return null;
    }
}

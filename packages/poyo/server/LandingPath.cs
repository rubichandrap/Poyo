using Microsoft.Extensions.Configuration;

namespace Poyo.Framework;

/// <summary>
/// Where an authenticated visitor to a <c>guest</c> route is sent:
/// <c>Routes:LandingPath</c>, default <c>/Dashboard</c>. It is checked against
/// the registry at boot, because each way it can be wrong only shows once a
/// signed-in visitor reaches a guest page: a guest route as the landing path
/// redirects to itself forever, and a path no route declares lands on a 404.
/// </summary>
internal static class LandingPath
{
    public const string ConfigurationKey = "Routes:LandingPath";
    public const string Default = "/Dashboard";

    public static string Configured(IConfiguration configuration) =>
        configuration[ConfigurationKey] ?? Default;

    /// <summary>
    /// The redirect target: a root-relative landing path names a page of this
    /// application, so it resolves under the request's path base ("~/"), the
    /// way the registry's own paths do: an app hosted at /Poyo lands on
    /// /Poyo/Dashboard, not on the host's /Dashboard. Absolute URLs and "~/"
    /// paths pass through.
    /// </summary>
    public static string RedirectTarget(IConfiguration configuration)
    {
        var landingPath = Configured(configuration);
        return IsAppPath(landingPath) ? "~" + landingPath : landingPath;
    }

    /// <summary>
    /// Fails the boot when the landing path cannot serve the redirect it
    /// exists for. Only a registry with a guest route redirects to it, so a
    /// registry without one boots whatever the value is. An absolute URL
    /// leaves the application and is not checked.
    /// </summary>
    public static void Validate(RoutePolicy policy, IConfiguration configuration)
    {
        if (!policy.Routes.Any(route => route.Access == RouteAccess.Guest))
        {
            return;
        }

        var landingPath = Configured(configuration);
        if (IsAbsoluteUrl(landingPath))
        {
            return;
        }

        var appPath = landingPath.StartsWith("~/", StringComparison.Ordinal)
            ? landingPath[1..]
            : landingPath;
        if (!IsAppPath(appPath))
        {
            throw new RoutePolicyException(
                $"{ConfigurationKey} '{landingPath}' is neither an app path beginning with '/' nor an absolute " +
                "URL. It is where a signed-in visitor to a guest route is redirected; set it to a registry " +
                "route's path, for example '/Dashboard'.");
        }

        var path = appPath.Split('?', '#')[0];
        var route = policy.Find(path);
        if (route is null)
        {
            throw new RoutePolicyException(
                $"{ConfigurationKey} '{landingPath}' names no route in the registry, so a signed-in visitor to " +
                "a guest route would be redirected to a 404. Declare the route, or set " +
                $"{ConfigurationKey} to the path of one that exists" +
                (landingPath == Default && configuration[ConfigurationKey] is null
                    ? $" — '{Default}' is the default, used because {ConfigurationKey} is not set."
                    : "."));
        }

        if (route.Access == RouteAccess.Guest)
        {
            throw new RoutePolicyException(
                $"{ConfigurationKey} '{landingPath}' is the guest route '{route.Name}'. A signed-in visitor to a " +
                "guest route is redirected to the landing path, so it would be redirected to it again, forever. " +
                "Set it to a public or protected route.");
        }
    }

    private static bool IsAppPath(string value) =>
        value.StartsWith('/') && !value.StartsWith("//", StringComparison.Ordinal);

    private static bool IsAbsoluteUrl(string value) =>
        value.StartsWith("//", StringComparison.Ordinal)
        || (Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps));
}

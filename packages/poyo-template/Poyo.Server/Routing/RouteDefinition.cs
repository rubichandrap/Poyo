using Poyo.Server.Models;

namespace Poyo.Server.Routing;

public enum RouteAccess
{
    Protected,
    Public,
    Guest,
}

public record RouteDefinition(
    string Path,
    string Name,
    RouteFiles Files,
    RouteAccess Access = RouteAccess.Protected,
    SeoModel? Seo = null,
    string? Controller = null,
    string? Action = null);

public record RouteFiles(
    string View,
    string? React = null);

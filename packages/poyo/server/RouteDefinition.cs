namespace Poyo.Framework;

/// <summary>
/// The registry's access model for a route: who may reach it.
/// </summary>
public enum RouteAccess
{
    Protected,
    Public,
    Guest,
}

/// <summary>
/// One route as the server reads it from the routes registry.
/// </summary>
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

using Poyo.Server.Models;

namespace Poyo.Server.Routing;

public record RouteDefinition(
    string Path,
    string Name,
    RouteFiles Files,
    bool IsPublic,
    bool IsGuestOnly,
    SeoModel? Seo = null,
    string? Controller = null,
    string? Action = null);

public record RouteFiles(
    string View,
    string? React = null);

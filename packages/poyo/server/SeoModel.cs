using System.Text.Json;

namespace Poyo.Framework;

/// <summary>
/// The registry's SEO metadata for a route, applied to every view by the
/// SeoPolicyFilter.
/// </summary>
public record SeoModel(
    string? Title,
    string? Description,
    Dictionary<string, string>? Meta,
    JsonElement? JsonLd);

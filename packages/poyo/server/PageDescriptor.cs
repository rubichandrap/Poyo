namespace Poyo.Framework;

/// <summary>
/// The dynamic-navigation wire payload for a registry page: the canonical
/// route name, the registry SEO, and the page data — structurally equal to
/// what the document injects into window.SERVER_DATA. Serialized with
/// camelCase keys over the wire.
/// </summary>
public sealed record PageDescriptor(string Name, SeoModel? Seo, System.Text.Json.JsonElement? PageData);

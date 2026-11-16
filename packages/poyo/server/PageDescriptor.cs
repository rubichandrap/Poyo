namespace Poyo.Framework;

/// <summary>
/// The dynamic-navigation wire payload for a registry page: the descriptor
/// format version, the canonical route name, the registry SEO, and the page
/// data — structurally equal to what the document injects into
/// window.SERVER_DATA for the same normalized controller-produced value. A
/// later request can produce fresh fields. Serialized with camelCase keys over
/// the wire.
/// </summary>
/// <remarks>
/// <see cref="V"/> lets the two sides change the format safely: a client that
/// receives a version newer than it understands falls back to a document load
/// instead of misreading the payload. Bump <see cref="CurrentVersion"/> only
/// for a change an older client would misread; adding an optional field is
/// not one.
/// </remarks>
public sealed record PageDescriptor(string Name, SeoModel? Seo, System.Text.Json.JsonElement? PageData)
{
    /// <summary>The descriptor format this server emits (wire contract).</summary>
    public const int CurrentVersion = 1;

    /// <summary>The descriptor format version, serialized first as "v".</summary>
    [System.Text.Json.Serialization.JsonPropertyOrder(-1)]
    public int V { get; init; } = CurrentVersion;
}

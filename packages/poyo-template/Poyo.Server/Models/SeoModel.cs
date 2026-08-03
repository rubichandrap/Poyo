using System.Text.Json;

namespace Poyo.Server.Models;

public record SeoModel(
    string? Title,
    string? Description,
    Dictionary<string, string>? Meta,
    JsonElement? JsonLd
);

using System.Text.Json;

namespace Poyo.Server.Tests.Support;

internal static class DocumentPageData
{
    public static JsonElement Extract(string documentBody)
    {
        const string marker = "window.SERVER_DATA = JSON.parse(";
        var markerStart = documentBody.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(markerStart >= 0, "The document does not contain Page data.");

        var start = markerStart + marker.Length;
        var end = documentBody.IndexOf(");</script>", start, StringComparison.Ordinal);
        Assert.True(end > start, "The document Page data script is not closed.");

        var json = JsonSerializer.Deserialize<string>(documentBody[start..end])
            ?? throw new InvalidOperationException("The document Page data literal is null.");
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}

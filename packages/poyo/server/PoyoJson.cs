using System.Text.Json;

namespace Poyo.Framework;

/// <summary>
/// JSON validation for the framework's legacy descriptor window.SERVER_DATA
/// harvest.
/// </summary>
internal static class PoyoJson
{
    /// <summary>True when the text is a complete, parseable JSON value.</summary>
    public static bool IsValid(string candidate)
    {
        try
        {
            using var document = JsonDocument.Parse(candidate);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}

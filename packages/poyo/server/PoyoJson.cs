using System.Text.Json;

namespace Poyo.Framework;

/// <summary>
/// JSON validation shared by the framework's page paths: the descriptor's
/// window.SERVER_DATA harvest and PoyoPage's pre-serialized-string guard.
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

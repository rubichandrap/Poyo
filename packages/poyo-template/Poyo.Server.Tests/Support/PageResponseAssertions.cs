using System.Net;
using System.Text.Json;

namespace Poyo.Server.Tests.Support;

internal static class PageResponseAssertions
{
    internal static void AssertPrivateNoStore(HttpResponseMessage response)
    {
        Assert.Equal(
            "private, no-store",
            response.Headers.NonValidated["Cache-Control"].ToString());
        Assert.False(response.Headers.Contains("Pragma"));
        Assert.Null(response.Content.Headers.Expires);
    }

    /// <summary>
    /// A Poyo error response: the exception handler's JSON body, with the
    /// status 500 and a message that does not leak the exception.
    /// </summary>
    internal static async Task<JsonElement> ReadServerErrorAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var error = body.RootElement;
        Assert.Equal(500, error.GetProperty("code").GetInt32());
        Assert.False(
            string.IsNullOrWhiteSpace(error.GetProperty("data").GetString()));
        return error.Clone();
    }
}

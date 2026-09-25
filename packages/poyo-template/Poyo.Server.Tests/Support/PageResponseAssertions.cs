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
}

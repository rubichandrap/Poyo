using Poyo.Framework;

namespace Poyo.Server.Tests.Support;

internal static class NavigationRequests
{
    /// <summary>
    /// A request carrying the dynamic-navigation header, which asks the server
    /// for the page descriptor instead of the document.
    /// </summary>
    internal static HttpRequestMessage Descriptor(string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(
            PageResult.NavigationHeaderName,
            PageResult.NavigationHeaderValue);
        return request;
    }
}

using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The demo cookie and the CORS policy exist for one client: the Vite dev
/// server, which runs on another localhost origin. A deployment serves the
/// built client from the application itself, so a cross-site cookie and a
/// credentialed cross-origin policy are exposure without a user — the cookie
/// would ride along on a cross-site request, which is the CSRF surface
/// SameSite exists to close.
///
/// The switch is the hosting environment, so the contract is asserted on a
/// boot of each: the cookie's SameSite attribute in the login response, and
/// the CORS headers on a response to an allowed dev-server origin.
/// </summary>
public class CookieAndCorsPolicyTests
{
    private const string ViteDevOrigin = "http://localhost:5173";

    [Fact]
    public async Task Development_keeps_the_cookie_cross_site_and_allows_the_credentialed_dev_client()
    {
        using var factory = TestEnvironment.CreateServer(
            environment: "Development",
            startClient: true);

        var client = CreateClient(factory);
        var login = await LoginAsync(client);

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = AuthenticationCookie(login);
        Assert.Contains("samesite=none", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);

        using var cors = await FromViteDevOriginAsync(client);
        Assert.Equal(ViteDevOrigin, cors.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", cors.Headers.GetValues("Access-Control-Allow-Credentials").Single());
    }

    [Fact]
    public async Task Production_keeps_the_cookie_same_site_and_grants_no_cross_origin_credential()
    {
        using var factory = TestEnvironment.CreateServer(
            environment: "Production",
            startClient: true);

        var client = CreateClient(factory);
        var login = await LoginAsync(client);

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = AuthenticationCookie(login);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("samesite=none", cookie, StringComparison.OrdinalIgnoreCase);

        using var cors = await FromViteDevOriginAsync(client);
        Assert.False(cors.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.False(cors.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    private static HttpClient CreateClient(WebApplicationFactory<Program> factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client) =>
        client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });

    private static async Task<HttpResponseMessage> FromViteDevOriginAsync(HttpClient client)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/Login");
        request.Headers.Add("Origin", ViteDevOrigin);
        return await client.SendAsync(request);
    }

    private static string AuthenticationCookie(HttpResponseMessage response) =>
        response.Headers.GetValues("Set-Cookie").Single(value =>
            value.StartsWith(".AspNetCore.Cookies=", StringComparison.Ordinal));
}

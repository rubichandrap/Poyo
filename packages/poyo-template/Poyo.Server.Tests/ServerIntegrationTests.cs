using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class ServerIntegrationTests : IClassFixture<ServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ServerIntegrationTests(ServerFixture fixture)
    {
        _factory = fixture.Factory;
    }

    private HttpClient CreateClient() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });

    private HttpClient CreateServerClient()
    {
        var client = _factory.Server.CreateClient();
        client.BaseAddress = new Uri("https://localhost");
        return client;
    }

    private static async Task LoginAsync(HttpClient client)
    {
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    private static void AssertPrivateNoStoreAndAuthenticationCookie(
        HttpResponseMessage response)
    {
        Assert.Equal(
            "private, no-store",
            Assert.Single(response.Headers.NonValidated["Cache-Control"]));
        Assert.False(response.Headers.NonValidated.Contains("Pragma"));
        Assert.False(response.Headers.NonValidated.Contains("Expires"));
        Assert.Contains(
            response.Headers.GetValues("Set-Cookie"),
            value => value.StartsWith(".AspNetCore.Cookies=", StringComparison.Ordinal));
    }

    private static void ApplyResponseCookies(
        HttpClient client,
        CookieContainer cookies,
        HttpResponseMessage response)
    {
        foreach (var setCookie in response.Headers.GetValues("Set-Cookie"))
        {
            cookies.SetCookies(client.BaseAddress!, setCookie);
        }

        client.DefaultRequestHeaders.Remove("Cookie");
        var cookieHeader = cookies.GetCookieHeader(client.BaseAddress!);
        if (!string.IsNullOrEmpty(cookieHeader))
        {
            client.DefaultRequestHeaders.Add("Cookie", cookieHeader);
        }
    }

    [Fact]
    public async Task Home_serves_the_guest_landing_page()
    {
        var response = await CreateClient().GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Home", body);
        Assert.Contains("Poyo Framework", body);
    }

    [Fact]
    public async Task Home_redirects_authenticated_users_to_landing_page()
    {
        var client = CreateClient();
        await LoginAsync(client);

        var response = await client.GetAsync("/");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Dashboard", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task Home_route_returns_404()
    {
        var response = await CreateClient().GetAsync("/Home");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Unmatched_urls_return_404()
    {
        var response = await CreateClient().GetAsync("/DoesNotExist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Login_serves_page_when_anonymous()
    {
        var response = await CreateClient().GetAsync("/Login");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("Login", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Register_serves_guest_only_page_when_anonymous()
    {
        var response = await CreateClient().GetAsync("/Register");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("Register", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Dashboard_redirects_anonymous_users_to_login()
    {
        var response = await CreateClient().GetAsync("/Dashboard");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Login", response.Headers.Location?.AbsolutePath);
    }

    [Fact]
    public async Task Dashboard_conventional_alias_redirects_anonymous_users_to_login()
    {
        var response = await CreateClient().GetAsync("/Dashboard/Index");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Login", response.Headers.Location?.AbsolutePath);
    }

    [Fact]
    public async Task Dashboard_serves_after_login()
    {
        var client = CreateClient();
        await LoginAsync(client);

        var response = await client.GetAsync("/Dashboard");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Dashboard", body);

        var pageData = DocumentPageData.Extract(body);
        Assert.Equal(
            "This data was injected from the server; semicolons are safe.",
            pageData.GetProperty("message").GetString());
        Assert.Equal("demo", pageData.GetProperty("user").GetString());
    }

    [Fact]
    public async Task Login_is_private_no_store_and_sets_the_authentication_cookie()
    {
        var client = CreateServerClient();
        var cookies = new CookieContainer();

        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        AssertPrivateNoStoreAndAuthenticationCookie(login);
        ApplyResponseCookies(client, cookies, login);

        var dashboard = await client.GetAsync("/Dashboard");
        Assert.Equal(HttpStatusCode.OK, dashboard.StatusCode);
    }

    [Fact]
    public async Task Refresh_is_private_no_store_and_sets_the_authentication_cookie()
    {
        var client = CreateServerClient();
        var cookies = new CookieContainer();

        var refresh = await client.PostAsJsonAsync("/api/auth/refresh", new
        {
            token = "demo-token",
            refreshToken = "demo-refresh-token",
        });

        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        AssertPrivateNoStoreAndAuthenticationCookie(refresh);
        ApplyResponseCookies(client, cookies, refresh);

        var dashboard = await client.GetAsync("/Dashboard");
        Assert.Equal(HttpStatusCode.OK, dashboard.StatusCode);
    }

    [Fact]
    public async Task Logout_is_private_no_store_and_clears_the_authentication_cookie()
    {
        var client = CreateServerClient();
        var cookies = new CookieContainer();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        ApplyResponseCookies(client, cookies, login);

        var logout = await client.PostAsync("/api/auth/logout", null);

        Assert.Equal(HttpStatusCode.OK, logout.StatusCode);
        AssertPrivateNoStoreAndAuthenticationCookie(logout);
        ApplyResponseCookies(client, cookies, logout);

        var dashboard = await client.GetAsync("/Dashboard");
        Assert.Equal(HttpStatusCode.Redirect, dashboard.StatusCode);
        Assert.Equal("/Login", dashboard.Headers.Location?.AbsolutePath);
    }

    [Fact]
    public async Task Login_rejects_bad_credentials()
    {
        var login = await CreateClient().PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "wrong",
        });

        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);

        using var body = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        Assert.Equal("fail", body.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Unrelated_api_response_does_not_receive_the_page_cache_policy()
    {
        var response = await CreateClient().GetAsync("/api/test-unrelated");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(response.Headers.CacheControl);
    }
}

[ApiController]
[Route("api/test-unrelated")]
public sealed class TestUnrelatedApiController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok" });
}

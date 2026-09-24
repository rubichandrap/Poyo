using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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

    private static async Task LoginAsync(HttpClient client)
    {
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
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
    public async Task Dashboard_serves_after_login()
    {
        var client = CreateClient();
        await LoginAsync(client);

        var response = await client.GetAsync("/Dashboard");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Dashboard", body);

        const string marker = "window.SERVER_DATA = ";
        var dataStart = body.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(dataStart >= 0, "The Dashboard document does not contain Page data.");
        var dataEnd = body.IndexOf("</script>", dataStart + marker.Length, StringComparison.Ordinal);
        Assert.True(dataEnd > dataStart, "The Dashboard Page data script is not closed.");

        var json = body[(dataStart + marker.Length)..dataEnd].Trim().TrimEnd(';');
        using var pageData = JsonDocument.Parse(json);
        Assert.Equal(
            "This data was injected from the server; semicolons are safe.",
            pageData.RootElement.GetProperty("message").GetString());
        Assert.Equal("demo", pageData.RootElement.GetProperty("user").GetString());
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
}

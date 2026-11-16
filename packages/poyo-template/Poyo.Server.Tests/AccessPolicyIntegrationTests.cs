using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class AccessPolicyIntegrationTests : IClassFixture<AccessPolicyServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public AccessPolicyIntegrationTests(AccessPolicyServerFixture fixture)
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
    public async Task Protected_route_redirects_anonymous_users_to_login()
    {
        var response = await CreateClient().GetAsync("/Protected");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Login", response.Headers.Location?.AbsolutePath);
        PageResponseAssertions.AssertPrivateNoStore(response);
    }

    [Fact]
    public async Task Protected_route_with_trailing_slash_is_enforced_too()
    {
        var response = await CreateClient().GetAsync("/Protected/");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Login", response.Headers.Location?.AbsolutePath);
    }

    [Fact]
    public async Task Protected_route_serves_authenticated_users()
    {
        var client = CreateClient();
        await LoginAsync(client);

        var response = await client.GetAsync("/Protected");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Guest_route_serves_anonymous_users()
    {
        var response = await CreateClient().GetAsync("/Guest");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Guest_route_redirects_authenticated_users_to_landing_page()
    {
        var client = CreateClient();
        await LoginAsync(client);

        var response = await client.GetAsync("/Guest");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Dashboard", response.Headers.Location?.ToString());
        PageResponseAssertions.AssertPrivateNoStore(response);
    }

    [Fact]
    public async Task Public_route_serves_anonymous_users()
    {
        var response = await CreateClient().GetAsync("/Public");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Public_route_serves_authenticated_users()
    {
        var client = CreateClient();
        await LoginAsync(client);

        var response = await client.GetAsync("/Public");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Custom_controller_route_is_enforced_like_default_routes()
    {
        var anonymous = await CreateClient().GetAsync("/Custom");

        Assert.Equal(HttpStatusCode.Redirect, anonymous.StatusCode);
        Assert.Equal("/Login", anonymous.Headers.Location?.AbsolutePath);

        var client = CreateClient();
        await LoginAsync(client);

        var authenticated = await client.GetAsync("/Custom");
        Assert.Equal(HttpStatusCode.OK, authenticated.StatusCode);
    }

    [Fact]
    public async Task Protected_api_path_returns_401_instead_of_redirect()
    {
        var response = await CreateClient().GetAsync("/api/ProtectedApi");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
        PageResponseAssertions.AssertPrivateNoStore(response);
    }

    [Fact]
    public async Task Seo_from_registry_reaches_the_page()
    {
        var response = await CreateClient().GetAsync("/Public");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Public Page Title", body);
        Assert.Contains("Public OG Title", body);
        Assert.Contains("poyo, public", body);
    }
}

public sealed class AccessPolicyServerFixture : IDisposable
{
    public AccessPolicyServerFixture()
    {
        Factory = TestEnvironment.CreateServerAndStart(
            TestEnvironment.FixturePath("routes.access.json"));
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

/// <summary>
/// The guest redirect under a path base: an application hosted at /Poyo lands
/// authenticated visitors on its own landing page, not the host's.
/// </summary>
public class PathBaseAccessPolicyTests : IClassFixture<PathBaseAccessPolicyServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PathBaseAccessPolicyTests(PathBaseAccessPolicyServerFixture fixture)
    {
        _factory = fixture.Factory;
    }

    [Fact]
    public async Task Guest_redirect_lands_under_the_path_base()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });
        var login = await client.PostAsJsonAsync("/Poyo/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var response = await client.GetAsync("/Poyo/Guest");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Poyo/Dashboard", response.Headers.Location?.ToString());
    }
}

public sealed class PathBaseAccessPolicyServerFixture : IDisposable
{
    public PathBaseAccessPolicyServerFixture()
    {
        Factory = TestEnvironment.CreateServer(
            TestEnvironment.FixturePath("routes.access.json"),
            startClient: true,
            pathBase: "/Poyo");
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

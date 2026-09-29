using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Framework;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The Routes registry is the single source of truth for route existence, so a
/// page is served at exactly one URL: the path its registry entry declares. The
/// conventional controller/action URL of a registry controller, and of the
/// defaulted page controller, are both outside the registry, and both 404 in
/// either auth state.
/// </summary>
public class RouteBoundaryTests : IClassFixture<ServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public RouteBoundaryTests(ServerFixture fixture)
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
    public async Task Conventional_url_of_a_registry_controller_is_not_served()
    {
        // /Dashboard declares controller Dashboard / action Index, so
        // /Dashboard/Index is its conventional URL. The registry does not own
        // that path, so nothing answers for it.
        var response = await CreateClient().GetAsync("/Dashboard/Index");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Conventional_url_of_a_registry_controller_is_not_served_when_authenticated()
    {
        // It used to redirect an authenticated caller to the landing path — a
        // guest-redirect decision for a path the registry does not own.
        var client = CreateClient();
        await LoginAsync(client);

        var response = await client.GetAsync("/Dashboard/Index");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Conventional_url_of_the_defaulted_page_controller_is_not_served()
    {
        // A registry route with no declared controller is served by
        // Page/Index. That default is how it is served at its declared path; it
        // does not publish /Page/Index as a second URL.
        var response = await CreateClient().GetAsync("/Page/Index");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Conventional_url_of_the_defaulted_page_controller_is_not_served_when_authenticated()
    {
        var client = CreateClient();
        await LoginAsync(client);

        var response = await client.GetAsync("/Page/Index");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Conventional_url_is_answered_by_routing_before_any_framework_filter()
    {
        var response = await CreateClient().SendAsync(
            NavigationRequests.Descriptor("/Dashboard/Index"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // Nothing Poyo-owned touched this response. A registry route would have
        // got the access model, the privacy policy and the representation
        // selector from its filters, and a page result would have answered a
        // descriptor; both are absent, so the answer came from routing.
        Assert.False(response.Headers.NonValidated.Contains("Cache-Control"));
        Assert.DoesNotContain(PageResult.NavigationHeaderName, response.Headers.Vary);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("pageData", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_custom_controllers_page_is_reachable_only_at_its_declared_path()
    {
        var client = CreateClient();
        await LoginAsync(client);

        var declared = await client.GetAsync("/Dashboard");
        var conventional = await client.GetAsync("/Dashboard/Index");

        Assert.Equal(HttpStatusCode.OK, declared.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, conventional.StatusCode);
    }

    [Fact]
    public async Task An_unregistered_url_is_a_clean_404_in_both_auth_states()
    {
        // Not a difference this change made — an unmatched path always 404'd —
        // but the authenticated half is the shape of the bug it removes, so
        // guard it: a URL nobody declared must not become a landing-path
        // redirect for a signed-in caller.
        var anonymous = await CreateClient().GetAsync("/DoesNotExist");

        var client = CreateClient();
        await LoginAsync(client);
        var authenticated = await client.GetAsync("/DoesNotExist");

        Assert.Equal(HttpStatusCode.NotFound, anonymous.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, authenticated.StatusCode);
    }

    [Fact]
    public async Task A_protected_route_declared_path_still_challenges_an_anonymous_request()
    {
        // Removing the conventional URL must not weaken enforcement: the
        // declared path is access-checked, and by the same lookup every other
        // seam uses.
        var response = await CreateClient().GetAsync("/Dashboard");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Login", response.Headers.Location?.AbsolutePath);
        PageResponseAssertions.AssertPrivateNoStore(response);
    }

    [Fact]
    public async Task Api_controllers_still_route()
    {
        var response = await CreateClient().GetAsync("/api/test-unrelated");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("success", body.RootElement.GetProperty("status").GetString());
    }
}

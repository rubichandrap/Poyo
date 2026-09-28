using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// Strict at rest, liberal at runtime. The registry is authored, so it is held
/// to a canonical form at boot; a request URL is owned by the browser, so it is
/// normalized rather than rejected. These cases prove the second half costs
/// nothing: the same status, the same page name, and the same privacy headers
/// as the canonical request, in both authentication states.
/// </summary>
public class RequestNormalizationTests : IClassFixture<RequestNormalizationServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public RequestNormalizationTests(RequestNormalizationServerFixture fixture)
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

    private static async Task<PageRepresentation> DescribeAsync(HttpClient client, string path)
    {
        var response = await client.SendAsync(NavigationRequests.Descriptor(path));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        PageResponseAssertions.AssertPrivateNoStore(response);

        var descriptor = await response.Content.ReadFromJsonAsync<JsonElement>();
        return new PageRepresentation(
            descriptor.GetProperty("name").GetString(),
            SeoTitle(descriptor));
    }

    private static string? SeoTitle(JsonElement descriptor)
    {
        var seo = descriptor.GetProperty("seo");
        return seo.ValueKind == JsonValueKind.Null ? null : seo.GetProperty("title").GetString();
    }

    [Theory]
    [InlineData("/Public")]
    [InlineData("/public")]
    [InlineData("/PUBLIC")]
    [InlineData("/public/")]
    [InlineData("/Public/")]
    public async Task An_anonymous_request_for_a_declared_route_is_served_however_it_is_spelled(
        string requested)
    {
        var canonical = await DescribeAsync(CreateClient(), "/Public");

        var actual = await DescribeAsync(CreateClient(), requested);

        Assert.Equal(canonical, actual);
    }

    [Theory]
    [InlineData("/Protected")]
    [InlineData("/protected")]
    [InlineData("/PROTECTED/")]
    public async Task A_protected_route_serves_the_same_page_after_login_however_it_is_spelled(
        string requested)
    {
        var client = CreateClient();
        await LoginAsync(client);
        var canonical = await DescribeAsync(client, "/Protected");

        var actual = await DescribeAsync(client, requested);

        Assert.Equal(canonical, actual);
    }

    [Theory]
    [InlineData("/Protected")]
    [InlineData("/protected")]
    [InlineData("/PROTECTED/")]
    public async Task A_protected_route_challenges_an_anonymous_request_however_it_is_spelled(
        string requested)
    {
        var canonical = await CreateClient().GetAsync("/Protected");

        var actual = await CreateClient().GetAsync(requested);

        Assert.Equal(canonical.StatusCode, actual.StatusCode);
        Assert.Equal("/Login", actual.Headers.Location?.AbsolutePath);
        PageResponseAssertions.AssertPrivateNoStore(actual);
    }

    private sealed record PageRepresentation(string? Name, string? SeoTitle);
}

public sealed class RequestNormalizationServerFixture : IDisposable
{
    public RequestNormalizationServerFixture()
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

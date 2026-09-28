using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class MissingViewRouteTests : IClassFixture<MissingViewServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public MissingViewRouteTests(MissingViewServerFixture fixture)
    {
        _factory = fixture.Factory;
    }

    private HttpClient CreateClient() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });

    [Fact]
    public async Task Missing_view_does_not_block_startup()
    {
        var response = await CreateClient().GetAsync("/Serves");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Missing_view_fails_at_request_time()
    {
        var response = await CreateClient().GetAsync("/MissingView");

        // The removed fallback route was never the error path: the exception
        // handler writes its own response, with no status-code-pages middleware
        // in between, so an action that throws still answers as the handler
        // wrote it.
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(500, body.RootElement.GetProperty("code").GetInt32());
        Assert.False(
            string.IsNullOrWhiteSpace(body.RootElement.GetProperty("data").GetString()));
        PageResponseAssertions.AssertPrivateNoStore(response);
    }
}

public sealed class MissingViewServerFixture : IDisposable
{
    public MissingViewServerFixture()
    {
        Factory = TestEnvironment.CreateServerAndStart(
            TestEnvironment.FixturePath("routes.missing-view.json"));
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

using System.Net;
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

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
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

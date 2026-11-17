using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The path-base contract, exercised at every seam that can break it:
/// the document's mount attribute, static assets, the API, and the auth
/// redirect. The URL-construction rules themselves are checked by the
/// `subpath-contract` model in the CLI package; these tests prove the host
/// actually applies the base the configuration names.
/// </summary>
public class SubpathDeploymentTests : IClassFixture<SubpathServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public SubpathDeploymentTests(SubpathServerFixture fixture)
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
    public async Task Document_declares_the_path_base_for_the_client()
    {
        var response = await CreateClient().GetAsync("/Poyo/Public");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("data-base-path=\"/Poyo/\"", body);
    }

    [Fact]
    public async Task Static_assets_are_served_under_the_base()
    {
        var probeRelativePath = Path.Combine(
            "wwwroot",
            "generated",
            "subpath-probe.txt");
        var contentRoot = _factory.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath;
        var probePath = Path.Combine(contentRoot, probeRelativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(probePath)!);
        await File.WriteAllTextAsync(probePath, "probe");

        try
        {
            var inside = await CreateClient().GetAsync("/Poyo/generated/subpath-probe.txt");

            Assert.Equal(HttpStatusCode.OK, inside.StatusCode);
        }
        finally
        {
            File.Delete(probePath);
        }
    }

    [Fact]
    public async Task Api_is_reachable_under_the_base()
    {
        // The route is protected, so 401 is the proof the request reached the
        // app's own pipeline under /Poyo rather than falling to a 404.
        var response = await CreateClient().GetAsync("/Poyo/api/ProtectedApi");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Auth_challenge_redirects_under_the_base()
    {
        var response = await CreateClient().GetAsync("/Poyo/Protected");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.StartsWith("/Poyo/Login", response.Headers.Location?.PathAndQuery);
    }
}

/// <summary>
/// A blank path base is not a mount: the application stays at the host root,
/// exactly as it does when the value is unset.
/// </summary>
public class BlankPathBaseDeploymentTests : IClassFixture<BlankPathBaseServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public BlankPathBaseDeploymentTests(BlankPathBaseServerFixture fixture)
    {
        _factory = fixture.Factory;
    }

    [Fact]
    public async Task Blank_path_base_leaves_the_app_at_the_root()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });

        var response = await client.GetAsync("/Public");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}

public sealed class BlankPathBaseServerFixture : IDisposable
{
    public BlankPathBaseServerFixture()
    {
        Factory = TestEnvironment.CreateServer(
            TestEnvironment.FixturePath("routes.access.json"),
            startClient: true,
            pathBase: "");
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

public sealed class SubpathServerFixture : IDisposable
{
    public SubpathServerFixture()
    {
        // Program.cs owns the path base: the host states it once and every URL
        // the app emits resolves against it. No startup filter supplies it,
        // so this fixture proves the wiring rather than a test-only seam.
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

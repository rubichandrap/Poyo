using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// Where the registry comes from: an explicit value, then "Routes:JsonPath"
/// resolved against the content root, then the file beside the application.
/// The fallback never consults the process working directory — in ASP.NET it is
/// also the default content root, so anchoring there would make a deployment's
/// access model depend on the directory its host happened to start it in. A
/// relative "Routes:JsonPath" does inherit the working directory, because it is
/// resolved against the content root; the host chooses the content root, so
/// that is the operator's instruction rather than the framework's default.
/// </summary>
public class RegistryResolutionTests
{
    [Fact]
    public async Task A_relative_registry_path_loads_the_registry_from_the_content_root()
    {
        // The content root is the server project, so this is the registry at
        // the project root — the location the development launch profile names.
        using var factory = TestEnvironment.CreateServer("../routes.json", startClient: true);

        using var client = factory.CreateClient();
        using var document = await client.GetAsync("/Login");

        Assert.Equal(HttpStatusCode.OK, document.StatusCode);
    }

    [Fact]
    public void A_relative_registry_path_that_resolves_nowhere_names_the_content_root()
    {
        using var serving = TestEnvironment.CreateServer(startClient: true);
        var contentRoot = serving.Services
            .GetRequiredService<IWebHostEnvironment>().ContentRootPath;

        var failure = TestEnvironment.BootFailureFor("registry-that-is-not-there.json");

        Assert.NotNull(failure);
        Assert.Contains(
            Path.Combine(contentRoot, "registry-that-is-not-there.json"),
            failure.Message);
    }
}

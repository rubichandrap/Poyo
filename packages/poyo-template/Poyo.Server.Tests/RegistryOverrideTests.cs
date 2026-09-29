using System.Net;
using System.Text.Json;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// A deployment that names its registry with `Routes:JsonPath` serves that
/// registry. Losing the name is the hazard this release introduces, and it is
/// silent: the published artifact carries a registry of its own, so the
/// resolution chain answers from that instead of failing the boot.
///
/// The seam is a real published application, because the claim is about what a
/// deployed artifact does when a host variable is absent. An in-process host
/// could not answer it — the copy beside the assembly only exists in a
/// published output, and an in-process launch always names the project-root
/// registry explicitly.
/// </summary>
public class RegistryOverrideTests
{
    /// <summary>
    /// A route the host's registry declares and the registry beside the
    /// application does not. Its presence is the difference between the two
    /// files, so it is what identifies which one served a request.
    /// </summary>
    private const string HostOnlyRoute = "/HostOnly";

    [Fact]
    public async Task A_deployment_serves_the_registry_its_host_names()
    {
        using var hostRegistry = HostRegistry.Declaring(HostOnlyRoute);
        using var server = await PublishedServer.Start(
            PublishedServer.PublishDirectory,
            HostNames(hostRegistry.RegistryPath));

        using var response = await server.CreateClient().GetAsync(HostOnlyRoute);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>
    /// Losing the name does not fail the boot — it silently serves a
    /// different file. The deployment still starts, still enforces an access
    /// model, and still answers every request; the model is simply the one
    /// beside the application rather than the one the host named.
    ///
    /// This is why a green boot is not evidence that the migration is
    /// complete. A loud failure would announce itself; this does not, so the
    /// operator has to move the value before it moves.
    /// </summary>
    [Fact]
    public async Task Losing_the_registry_name_silently_serves_the_registry_beside_the_application()
    {
        using var hostRegistry = HostRegistry.Declaring(HostOnlyRoute);

        using var named = await PublishedServer.Start(
            PublishedServer.PublishDirectory,
            HostNames(hostRegistry.RegistryPath));
        using var namedResponse = await named.CreateClient().GetAsync(HostOnlyRoute);
        Assert.Equal(HttpStatusCode.OK, namedResponse.StatusCode);

        using var lost = await PublishedServer.Start(
            PublishedServer.PublishDirectory,
            HostNames(null));
        using var lostResponse = await lost.CreateClient().GetAsync(HostOnlyRoute);

        Assert.Equal(HttpStatusCode.NotFound, lostResponse.StatusCode);

        // Serving, and enforcing, from the registry beside the application.
        using var login = await lost.CreateClient().GetAsync("/Login");
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    /// <summary>
    /// The variables one deployment sets, over the baseline a published
    /// application boots with. A null value removes a variable, which is how a
    /// test says "this host does not set it" — the state the operator is in
    /// after the value reverts with the environment file.
    /// </summary>
    private static Dictionary<string, string?> HostNames(string? registryPath) => new()
    {
        ["Routes__JsonPath"] = registryPath,
    };

    /// <summary>
    /// A registry at a location only the host names, carrying one route the
    /// registry beside the application does not declare. It is the template's
    /// own registry plus that route, so the two files agree about everything
    /// else and differ on exactly the thing the assertion reads — and it
    /// reuses a view that exists, so the difference is which registry answered
    /// rather than whether a page could be rendered.
    /// </summary>
    private sealed class HostRegistry : IDisposable
    {
        private readonly string _directory;

        public string RegistryPath { get; }

        private HostRegistry(string registryPath, string directory)
        {
            RegistryPath = registryPath;
            _directory = directory;
        }

        public static HostRegistry Declaring(string path)
        {
            var directory = Path.Combine(
                Path.GetTempPath(), $"poyo-host-registry-{Guid.NewGuid():N}");
            Directory.CreateDirectory(directory);

            var registryPath = Path.Combine(directory, "routes.json");
            File.WriteAllText(registryPath, Adding(File.ReadAllText(
                TestEnvironment.TemplateRoutesPath()), path));

            return new HostRegistry(registryPath, directory);
        }

        public void Dispose() => Directory.Delete(_directory, recursive: true);

        /// <summary>
        /// The template's registry with one route appended, as text. Editing
        /// the text keeps the host's registry byte-identical to the shipped
        /// one apart from the addition, which is what makes the two comparable.
        /// </summary>
        private static string Adding(string registryJson, string path)
        {
            using var document = JsonDocument.Parse(registryJson);
            var routes = document.RootElement.EnumerateArray().ToList();

            var addition = $$"""
                {
                    "path": "{{path}}",
                    "name": "HostOnly",
                    "files": {
                        "react": "src/pages/Home/index.page.tsx",
                        "view": "Views/Home/Index.cshtml"
                    },
                    "access": "public"
                }
                """;

            return "[\n  " + string.Join(",\n  ", routes.Select(r => r.GetRawText()))
                + ",\n  " + addition + "\n]\n";
        }
    }
}

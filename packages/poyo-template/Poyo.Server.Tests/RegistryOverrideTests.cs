using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
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
    [Fact]
    public async Task A_deployment_serves_the_registry_its_host_names()
    {
        using var hostRegistry = HostRegistry.Open();
        using var server = await PublishedServer.Start(
            PublishedServer.PublishDirectory,
            HostNamesRegistryAt(hostRegistry.RegistryPath));

        using var dashboard = await server.CreateClient().GetAsync("/Dashboard");

        // The host's registry calls /Dashboard public, so an anonymous caller
        // is served it rather than challenged. The registry beside the
        // application calls it protected, so a 200 is only reachable through
        // the file the host named.
        Assert.Equal(HttpStatusCode.OK, dashboard.StatusCode);
    }

    /// <summary>
    /// Losing the name does not fail the boot — it silently serves a different
    /// file. The deployment still starts, still enforces an access model, and
    /// still answers every request; the model is simply the one beside the
    /// application rather than the one the host named.
    ///
    /// This is why a green boot is not evidence that the migration is
    /// complete. A loud failure would announce itself; this does not, so the
    /// operator has to move the value before it moves.
    /// </summary>
    [Fact]
    public async Task Losing_the_registry_name_silently_serves_the_registry_beside_the_application()
    {
        using var hostRegistry = HostRegistry.Open();

        using var named = await PublishedServer.Start(
            PublishedServer.PublishDirectory,
            HostNamesRegistryAt(hostRegistry.RegistryPath));
        using var namedDashboard = await named.CreateClient().GetAsync("/Dashboard");
        Assert.Equal(HttpStatusCode.OK, namedDashboard.StatusCode);

        using var lost = await PublishedServer.Start(
            PublishedServer.PublishDirectory,
            HostNamesRegistryAt(null));
        using var lostDashboard = await lost.CreateClient().GetAsync("/Dashboard");

        // Serving, and enforcing, from the registry beside the application —
        // where the same route is protected, so the anonymous caller is
        // challenged rather than served. The access model changed, silently.
        Assert.Equal(HttpStatusCode.Redirect, lostDashboard.StatusCode);
        Assert.Equal("/Login", lostDashboard.Headers.Location?.AbsolutePath);
    }

    /// <summary>
    /// The variables one deployment sets, over the baseline a published
    /// application boots with. A null registry path removes the variable,
    /// which is how a test says "this host does not set it" — the state the
    /// operator is in after the value reverts with the environment file.
    /// </summary>
    private static Dictionary<string, string?> HostNamesRegistryAt(string? registryPath) => new()
    {
        ["Routes__JsonPath"] = registryPath,
    };

    /// <summary>
    /// A registry at a location only the host names, calling one route public
    /// that the registry beside the application calls protected. It is derived
    /// from the template's own registry so the two files agree about everything
    /// else and differ on exactly the access model the assertions read.
    /// </summary>
    private sealed class HostRegistry : IDisposable
    {
        private readonly TemporaryDirectory _directory;

        private HostRegistry(TemporaryDirectory directory, string registryPath)
        {
            _directory = directory;
            RegistryPath = registryPath;
        }

        public string RegistryPath { get; }

        public static HostRegistry Open()
        {
            var directory = TemporaryDirectory.Create("host-registry");
            var registryPath = directory.WriteFile(
                "routes.json",
                DeclaringDashboardPublic(File.ReadAllText(TestEnvironment.TemplateRoutesPath())));

            return new HostRegistry(directory, registryPath);
        }

        public void Dispose() => _directory.Dispose();

        /// <summary>
        /// The template's registry with one route's access changed. Editing
        /// the parsed value rather than the text keeps the rest of the file
        /// exactly as the template wrote it, so the only difference between the
        /// two registries is the access model under test.
        /// </summary>
        private static string DeclaringDashboardPublic(string registryJson)
        {
            using var document = JsonDocument.Parse(registryJson);
            var routes = document.RootElement.EnumerateArray().Select(route =>
            {
                var entry = JsonNode.Parse(route.GetRawText())!.AsObject();
                if (entry["path"]!.GetValue<string>() == "/Dashboard")
                {
                    entry["access"] = "public";
                }

                return entry;
            });

            return new JsonArray(routes.Select(route => (JsonNode)route).ToArray())
                .ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        }
    }
}

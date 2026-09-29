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
        using var directory = TemporaryDirectory.Create("host-registry");
        var hostRegistry = HostNamesDashboardPublic(directory);

        // The host's registry calls /Dashboard public, so an anonymous caller
        // is served it rather than challenged. The registry beside the
        // application calls it protected, so a 200 is only reachable through
        // the file the host named.
        var dashboard = await DashboardServedBy(hostRegistry);

        Assert.Equal(HttpStatusCode.OK, dashboard.Status);
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
        using var directory = TemporaryDirectory.Create("host-registry");

        // The control, and the only difference the second half relies on.
        var named = await DashboardServedBy(HostNamesDashboardPublic(directory));
        Assert.Equal(HttpStatusCode.OK, named.Status);

        var lost = await DashboardServedBy(null);

        // Serving, and enforcing, from the registry beside the application —
        // where the same route is protected, so the anonymous caller is
        // challenged rather than served. The access model changed, silently.
        Assert.Equal(HttpStatusCode.Redirect, lost.Status);
        Assert.Equal("/Login", lost.Location);
    }

    /// <summary>
    /// Starts a published application whose host names the registry at
    /// <paramref name="hostRegistryPath"/> — or names none at all, when that is
    /// null — and asks it for <c>/Dashboard</c>. The status and the redirect
    /// target are the whole of what these tests read: whether the route was
    /// served, challenged, or landed somewhere else.
    /// </summary>
    private static async Task<(HttpStatusCode Status, string? Location)> DashboardServedBy(
        string? hostRegistryPath)
    {
        using var server = await PublishedServer.Start(
            PublishedServer.PublishDirectory,
            HostNamesRegistryAt(hostRegistryPath));
        using var dashboard = await server.CreateClient().GetAsync("/Dashboard");

        return (dashboard.StatusCode, dashboard.Headers.Location?.AbsolutePath);
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
    /// Writes a registry into the temporary directory at a location only the
    /// host names, calling one route public that the registry beside the
    /// application calls protected. It is derived from the template's own
    /// registry so the two files agree about everything else and differ on
    /// exactly the access model the assertions read.
    /// </summary>
    private static string HostNamesDashboardPublic(TemporaryDirectory directory) =>
        directory.WriteFile(
            "routes.json",
            DeclaringDashboardPublic(File.ReadAllText(TestEnvironment.TemplateRoutesPath())));

    /// <summary>
    /// The template's registry with one route's access changed. Editing the
    /// parsed value rather than the text keeps the rest of the file exactly as
    /// the template wrote it, so the only difference between the two registries
    /// is the access model under test.
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

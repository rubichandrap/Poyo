using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The deployment claim: a clean `dotnet publish` output is a self-contained
/// application. It carries the registry beside the application assembly and
/// serves every registry route whichever directory the host starts it from —
/// including the filesystem root, and including a directory that has nothing to
/// do with the project. It carries nothing environment-bearing, because the
/// environment file is a development convenience and what you ship is what you
/// reviewed.
/// </summary>
public class PublishedApplicationTests
{
    /// <summary>
    /// Pins the copy item that carries the registry into the output. The three
    /// tests below pin the behaviour that depends on it — booting with no
    /// registry location named at all.
    /// </summary>
    [Fact]
    public void The_publish_output_contains_the_registry()
    {
        var registry = Path.Combine(PublishedServer.PublishDirectory, "routes.json");

        Assert.True(
            File.Exists(registry),
            $"The published application must carry the registry beside the application ({registry}).");
    }

    /// <summary>
    /// The environment file is a development convenience, and what you ship is
    /// what you reviewed: the file does not travel with the artifact. A copy
    /// item that put an operator's production values into their own publish
    /// output would be the one way the file could reach a deployment, so the
    /// claim is checked against the output rather than against the project file
    /// that would have carried it.
    ///
    /// The filter is the dotenv family, which is what the framework's loader
    /// reads and what a hand-edited production file is called. It is not a
    /// claim about every file an environment could name: `appsettings.json` and
    /// its development sibling ship by the SDK's own design, and the general
    /// "nothing environment-bearing" rests on this project having no copy item
    /// for an environment file at all — of which this is the one that would
    /// otherwise be invisible.
    /// </summary>
    [Fact]
    public void The_publish_output_contains_no_dotenv_file()
    {
        var carried = Directory
            .EnumerateFiles(PublishedServer.PublishDirectory, "*", SearchOption.AllDirectories)
            .Where(file =>
                file.EndsWith(".env", StringComparison.Ordinal)
                || Path.GetFileName(file).StartsWith(".env.", StringComparison.Ordinal))
            .ToList();

        Assert.Empty(carried);
    }

    [Fact]
    public Task Every_registry_route_serves_from_the_publish_directory() =>
        AssertEveryRegistryRouteServesFrom(PublishedServer.PublishDirectory);

    [Fact]
    public Task Every_registry_route_serves_from_an_unrelated_working_directory() =>
        AssertEveryRegistryRouteServesFrom(
            Directory.CreateTempSubdirectory("poyo-unrelated-").FullName);

    [Fact]
    public Task Every_registry_route_serves_from_the_filesystem_root() =>
        AssertEveryRegistryRouteServesFrom(
            Path.GetPathRoot(AppContext.BaseDirectory)
            ?? throw new InvalidOperationException("The filesystem root could not be determined."));

    /// <summary>
    /// Every declared route answers with the outcome its access model calls
    /// for. An application that booted without its registry has no routes at
    /// all, so it answers 404 to all of them and enforces nothing.
    /// </summary>
    private static async Task AssertEveryRegistryRouteServesFrom(string workingDirectory)
    {
        using var server = await PublishedServer.Start(workingDirectory);
        var routes = DeclaredRoutes();

        using var anonymous = server.CreateClient();
        await AssertRoutesServeWith(anonymous, routes, authenticated: false);

        using var signedIn = server.CreateClient();
        using var login = await signedIn.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        signedIn.DefaultRequestHeaders.Add("Cookie", SessionCookieOf(login));
        await AssertRoutesServeWith(signedIn, routes, authenticated: true);
    }

    private static string SessionCookieOf(HttpResponseMessage login) =>
        string.Join("; ", login.Headers.GetValues("Set-Cookie")
            .Select(setCookie => setCookie.Split(';')[0]));

    private static async Task AssertRoutesServeWith(
        HttpClient client,
        IReadOnlyList<DeclaredRoute> routes,
        bool authenticated)
    {
        foreach (var route in routes)
        {
            using var document = await client.GetAsync(route.Path);
            Assert.Equal(ExpectedStatus(route.Access, authenticated), document.StatusCode);

            if (document.IsSuccessStatusCode)
            {
                Assert.True(
                    (await document.Content.ReadAsStringAsync())
                        .Contains($"data-page-name=\"{route.Name}\"", StringComparison.Ordinal),
                    $"Route '{route.Path}' did not serve its own page.");
            }
        }
    }

    private static HttpStatusCode ExpectedStatus(string access, bool authenticated) =>
        (access, authenticated) switch
        {
            // An access challenge and a landing redirect are different
            // decisions that happen to share a status, so the arms stay
            // separate — a reader who merges them loses the distinction.
            ("protected", false) => HttpStatusCode.Redirect,
            ("guest", true) => HttpStatusCode.Found,
            _ => HttpStatusCode.OK,
        };

    private static IReadOnlyList<DeclaredRoute> DeclaredRoutes()
    {
        using var registry = JsonDocument.Parse(File.ReadAllText(TestEnvironment.TemplateRoutesPath()));
        return registry.RootElement
            .EnumerateArray()
            .Select(route => new DeclaredRoute(
                Path: route.GetProperty("path").GetString()!,
                Name: route.GetProperty("name").GetString()!,
                Access: route.GetProperty("access").GetString()!))
            .ToList();
    }

    private sealed record DeclaredRoute(string Path, string Name, string Access);
}

using Poyo.Framework;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class RoutePolicyTests
{
    [Fact]
    public void Load_reads_valid_registry()
    {
        var policy = RoutePolicy.Load(TestEnvironment.FixturePath("routes.valid.json"));

        Assert.Equal(4, policy.Routes.Count);
        var home = policy.Routes.Single(r => r.Name == "Home");
        Assert.Equal("/", home.Path);
        Assert.Equal(RouteAccess.Guest, home.Access);
        Assert.Equal("Views/Home/Index.cshtml", home.Files.View);

        Assert.Equal(RouteAccess.Protected, policy.Routes.Single(r => r.Name == "Dashboard").Access);
        Assert.Equal(RouteAccess.Public, policy.Routes.Single(r => r.Name == "Login").Access);
        var register = policy.Routes.Single(r => r.Name == "Register");
        Assert.Equal(RouteAccess.Guest, register.Access);
        Assert.Equal("Register", register.Seo?.Title);
    }

    [Fact]
    public void Load_accepts_registry_with_missing_view_file()
    {
        var policy = RoutePolicy.Load(TestEnvironment.FixturePath("routes.missing-view.json"));

        Assert.Equal(2, policy.Routes.Count);
        Assert.Contains(policy.Routes, r => r.Name == "MissingView");
    }

    [Fact]
    public void Load_throws_on_registry_declaring_no_routes()
    {
        using var directory = TemporaryDirectory.Create("route-policy");
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(RegistryCorpus.WriteTo(directory, "empty-registry")));

        Assert.Contains("is empty", ex.Message);
        Assert.Contains("no routes", ex.Message);
    }

    [Fact]
    public void Load_throws_on_registry_file_with_no_content()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.blank.json")));

        Assert.Contains("is empty", ex.Message);
        Assert.Contains("no content", ex.Message);
    }

    [Fact]
    public void Load_throws_when_registry_missing()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.MissingRegistryPath()));

        Assert.Contains("was not found", ex.Message);
        Assert.Contains(TestEnvironment.MissingRegistryPath(), ex.Message);
    }

    [Fact]
    public void Load_throws_on_malformed_json()
    {
        using var directory = TemporaryDirectory.Create("route-policy");
        var registryPath = RegistryCorpus.WriteTo(directory, "malformed-text");

        var ex = Assert.Throws<RoutePolicyException>(() => RoutePolicy.Load(registryPath));

        Assert.Contains(registryPath, ex.Message);
        Assert.IsAssignableFrom<System.Text.Json.JsonException>(ex.InnerException);
    }

    /// <summary>
    /// The truth table of the one function that makes a request liberal: a
    /// request URL is owned by the browser, so a trailing slash is trimmed and
    /// the root path survives the trim.
    /// </summary>
    [Theory]
    [InlineData(null, "/")]
    [InlineData("", "/")]
    [InlineData("/", "/")]
    [InlineData("//", "/")]
    [InlineData("/Dashboard", "/Dashboard")]
    [InlineData("/Dashboard/", "/Dashboard")]
    [InlineData("/Dashboard///", "/Dashboard")]
    [InlineData("/reports/monthly/", "/reports/monthly")]
    [InlineData("Dashboard", "Dashboard")]
    public void A_request_path_is_normalized_without_touching_its_case(string? requestPath, string expected)
    {
        Assert.Equal(expected, RouteIdentity.NormalizeRequestPath(requestPath));
    }

    [Fact]
    public void Find_resolves_a_normalized_path_through_the_index()
    {
        var policy = RoutePolicy.Load(TestEnvironment.FixturePath("routes.valid.json"));

        Assert.Equal("Dashboard", policy.Find("/DASHBOARD")?.Name);
        Assert.Equal("Dashboard", policy.Find("/Dashboard///")?.Name);
        Assert.Null(policy.Find("/Dashboard/Extra"));
    }

    /// <summary>
    /// The ordered list and the lookup index are two views of one registry:
    /// declaration order still answers error messages and endpoint
    /// registration, and the index is an acceleration over normalized paths.
    /// </summary>
    [Fact]
    public void The_ordered_list_is_retained_alongside_the_index()
    {
        var policy = RoutePolicy.Load(TestEnvironment.FixturePath("routes.valid.json"));

        Assert.Equal(
            new[] { "/", "/Dashboard", "/Login", "/Register" },
            policy.Routes.Select(route => route.Path));
    }

    [Fact]
    public void Find_matches_registry_path_case_insensitively()
    {
        var policy = RoutePolicy.Load(TestEnvironment.FixturePath("routes.valid.json"));

        Assert.Equal("Dashboard", policy.Find("/dashboard")?.Name);
        Assert.Equal("Dashboard", policy.Find("/dashboard/")?.Name);
        Assert.Equal("Home", policy.Find("/")?.Name);
        Assert.Null(policy.Find("/NotARoute"));
        Assert.Null(policy.Find("/api/auth/login"));
    }

    /// <summary>
    /// An operator reading a startup failure should not have to guess from a
    /// stack trace which of the four states the registry arrived in, so each
    /// message carries its own state and no other one's. None of the four can
    /// come from the same place: a path that was never there, a fixture with no
    /// content, a fixture this process holds open, and the corpus case for text
    /// that is not JSON.
    /// </summary>
    [Fact]
    public void The_four_unusable_registry_states_are_told_apart()
    {
        using var unreadable = TestEnvironment.LockRegistry("routes.valid.json");
        using var directory = TemporaryDirectory.Create("route-policy");

        var states = new (string Marker, string Message)[]
        {
            ("was not found", CaptureFailure(TestEnvironment.MissingRegistryPath())),
            ("is empty", CaptureFailure(TestEnvironment.FixturePath("routes.blank.json"))),
            ("cannot read", CaptureFailure(unreadable.RegistryPath)),
            ("is not a valid routes registry",
                CaptureFailure(RegistryCorpus.WriteTo(directory, "malformed-text"))),
        };

        foreach (var (marker, message) in states)
        {
            Assert.Contains(marker, message, StringComparison.OrdinalIgnoreCase);

            foreach (var (otherMarker, _) in states.Where(s => s.Marker != marker))
            {
                Assert.DoesNotContain(otherMarker, message, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    /// <summary>
    /// A registry this process cannot reach is not a missing registry.
    /// <c>File.Exists</c> answers false for any stat failure, not only for an
    /// absent file, so a registry sitting in a directory without execute
    /// permission is exactly the case where "was not found" is the wrong
    /// diagnosis — it sends the operator to look for a file that is already
    /// there, in a directory that is already there.
    /// </summary>
    [Fact]
    public void An_unreachable_registry_is_reported_as_unreadable_not_missing()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var directory = Path.Combine(Path.GetTempPath(), $"poyo-unreachable-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        var registryPath = Path.Combine(directory, "routes.json");
        File.WriteAllText(registryPath, "[]");

        try
        {
            // Unix mode bits are the seam. A root-run job bypasses them, so the
            // test declines to assert anything it cannot actually reach.
            File.SetUnixFileMode(directory, UnixFileMode.None);

            if (File.Exists(registryPath))
            {
                return;
            }

            var message = CaptureFailure(registryPath);

            Assert.Contains("cannot read", message, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("was not found", message, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            File.SetUnixFileMode(
                directory,
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            Directory.Delete(directory, recursive: true);
        }
    }

    private static string CaptureFailure(string registryPath) =>
        Assert.Throws<RoutePolicyException>(() => RoutePolicy.Load(registryPath)).Message;
}

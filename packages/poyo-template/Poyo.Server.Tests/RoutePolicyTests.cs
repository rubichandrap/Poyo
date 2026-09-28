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
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.empty.json")));

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
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.malformed.json")));

        Assert.Contains("routes.malformed.json", ex.Message);
        Assert.IsAssignableFrom<System.Text.Json.JsonException>(ex.InnerException);
    }

    [Fact]
    public void Load_throws_on_unknown_field()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.unknown-field.json")));

        Assert.Contains("bogusField", ex.Message);
    }

    [Fact]
    public void Load_throws_on_legacy_access_flags()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.legacy.json")));

        Assert.Contains("isPublic", ex.Message);
    }

    [Fact]
    public void Load_throws_on_wrong_type()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.wrong-type.json")));

        Assert.Contains("access", ex.Message);
    }

    [Fact]
    public void Load_throws_on_invalid_access_value()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.invalid-access.json")));

        Assert.Contains("access", ex.Message);
    }

    [Fact]
    public void Load_throws_on_duplicate_path()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.duplicate.json")));

        Assert.Contains("duplicate", ex.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("/dashboard", ex.Message);
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
    public void Load_throws_on_malformed_dynamic_value_naming_the_route()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.malformed-dynamic.json")));

        Assert.Contains("dynamic", ex.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("/dashboard", ex.Message, StringComparison.OrdinalIgnoreCase);
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
    /// message carries its own state and no other one's.
    /// </summary>
    [Fact]
    public void The_four_unusable_registry_states_are_told_apart()
    {
        using var unreadable = TestEnvironment.LockRegistry("routes.valid.json");

        var states = new (string Marker, string Message)[]
        {
            ("was not found", CaptureFailure(TestEnvironment.MissingRegistryPath())),
            ("is empty", CaptureFailure(TestEnvironment.FixturePath("routes.empty.json"))),
            ("cannot read", CaptureFailure(unreadable.RegistryPath)),
            ("is not valid JSON", CaptureFailure(TestEnvironment.FixturePath("routes.malformed.json"))),
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

    private static string CaptureFailure(string registryPath) =>
        Assert.Throws<RoutePolicyException>(() => RoutePolicy.Load(registryPath)).Message;
}

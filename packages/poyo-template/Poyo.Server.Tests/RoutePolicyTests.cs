using Poyo.Server.Routing;
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
    public void Load_accepts_empty_registry()
    {
        var policy = RoutePolicy.Load(TestEnvironment.FixturePath("routes.empty.json"));

        Assert.Empty(policy.Routes);
    }

    [Fact]
    public void Load_returns_empty_policy_when_registry_missing()
    {
        var missing = Path.Combine(Path.GetTempPath(), "does-not-exist-routes.json");

        var policy = RoutePolicy.Load(missing);

        Assert.Empty(policy.Routes);
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
}

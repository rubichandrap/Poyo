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
        Assert.True(home.IsPublic);
        Assert.Equal("Views/Home/Index.cshtml", home.Files.View);
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
    public void Load_throws_on_wrong_type()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.wrong-type.json")));

        Assert.Contains("isPublic", ex.Message);
    }

    [Fact]
    public void Load_throws_on_duplicate_path()
    {
        var ex = Assert.Throws<RoutePolicyException>(
            () => RoutePolicy.Load(TestEnvironment.FixturePath("routes.duplicate.json")));

        Assert.Contains("duplicate", ex.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("/dashboard", ex.Message);
    }
}

using Poyo.Framework;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class StartupFailureTests
{
    [Theory]
    [InlineData("routes.malformed.json", "malformed")]
    [InlineData("routes.unknown-field.json", "bogusField")]
    [InlineData("routes.legacy.json", "isPublic")]
    [InlineData("routes.wrong-type.json", "access")]
    [InlineData("routes.invalid-access.json", "access")]
    [InlineData("routes.duplicate.json", "duplicate")]
    [InlineData("routes.malformed-dynamic.json", "/dashboard")]
    public void Malformed_registry_fails_startup_loudly(string fixture, string messagePart)
    {
        var routePolicyError = TestEnvironment.BootFailureFor(
            TestEnvironment.FixturePath(fixture));

        Assert.NotNull(routePolicyError);
        Assert.Contains(messagePart, routePolicyError.Message, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The registry is a required deployment artifact, so each state it can
    /// arrive in is a startup failure with its own wording. A missing registry
    /// is the important one: it used to boot an application whose access model,
    /// SEO policy and no-store guarantee were all switched off.
    /// </summary>
    [Theory]
    [InlineData(TestEnvironment.MissingRegistry, "was not found")]
    [InlineData("routes.blank.json", "is empty")]
    [InlineData("routes.empty.json", "is empty")]
    [InlineData("routes.malformed.json", "is not valid JSON")]
    public void A_registry_the_server_cannot_load_fails_startup_loudly(
        string fixture,
        string messagePart)
    {
        var routePolicyError = TestEnvironment.BootFailureFor(
            TestEnvironment.FixturePath(fixture));

        Assert.NotNull(routePolicyError);
        Assert.Contains(messagePart, routePolicyError.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void An_unreadable_registry_fails_startup_loudly()
    {
        using var locked = TestEnvironment.LockRegistry("routes.valid.json");

        var routePolicyError = TestEnvironment.BootFailureFor(locked.RegistryPath);

        Assert.NotNull(routePolicyError);
        Assert.Contains("cannot read", routePolicyError.Message, StringComparison.OrdinalIgnoreCase);
    }
}

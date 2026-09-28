using System.Net;
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
    [InlineData("routes.duplicate.json", "is the same route as")]
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

    /// <summary>
    /// A route's identity is defined once and enforced at rest. The registry is
    /// read by three runtimes, each of which would otherwise need its own
    /// normalizer, so a non-canonical declaration is a startup failure rather
    /// than something one of them quietly fixes. Every message names the route
    /// it is about: a registry with twenty entries is still easy to fix.
    /// </summary>
    [Theory]
    [InlineData("routes.unrooted-path.json", "must begin with \"/\" — declare '/Dashboard'", "Dashboard")]
    [InlineData("routes.trailing-slash.json", "trailing slash — declare '/Dashboard'", "/Dashboard/")]
    [InlineData("routes.duplicate.json", "is the same route as", "/dashboard")]
    [InlineData("routes.duplicate-trailing-slash.json", "is the same route as", "/Dashboard/")]
    [InlineData("routes.blank-name.json", "blank name", "/Blank")]
    [InlineData("routes.missing-name.json", "blank name", "/Missing")]
    [InlineData("routes.slash-name.json", "must not begin or end with \"/\"", "/Home")]
    [InlineData("routes.duplicate-name.json", "duplicates the name", "/Second")]
    [InlineData("routes.controller-without-action.json", "a controller without the other", "/Custom")]
    [InlineData("routes.action-without-controller.json", "an action without the other", "/Custom")]
    [InlineData("routes.blank-controller.json", "blank controller or action", "/Blank")]
    public void A_registry_with_a_non_canonical_identity_fails_startup_loudly(
        string fixture,
        string messagePart,
        string offendingRoute)
    {
        var routePolicyError = TestEnvironment.BootFailureFor(
            TestEnvironment.FixturePath(fixture));

        Assert.NotNull(routePolicyError);
        Assert.Contains(messagePart, routePolicyError.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(offendingRoute, routePolicyError.Message, StringComparison.Ordinal);
    }

    /// <summary>
    /// The common case stays free of ceremony: no controller and no action is
    /// the default page controller, and declaring both is a custom route. The
    /// proof is the served page, not the absence of a throw.
    /// </summary>
    [Fact]
    public async Task A_registry_whose_routes_declare_neither_or_both_of_controller_and_action_boots()
    {
        using var factory = TestEnvironment.CreateServerAndStart(
            TestEnvironment.FixturePath("routes.identity-ok.json"));

        var response = await factory.CreateClient().GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
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

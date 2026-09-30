using System.Net;
using Poyo.Framework;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class StartupFailureTests
{
    public static TheoryData<string> RefusedCases()
    {
        var data = new TheoryData<string>();
        foreach (var corpusCase in RegistryCorpus.All.Where(c => c.ServerVerdict.Rejects))
        {
            data.Add(corpusCase.Id);
        }

        return data;
    }

    /// <summary>
    /// Every registry the corpus says the server refuses fails the boot, and the
    /// boot failure is the registry failure. Driven by the corpus rather than by
    /// a fixture per rule, so a rule cannot be boot-tested here and
    /// reader-tested there against two sets of wording that drift apart.
    /// </summary>
    [Theory]
    [MemberData(nameof(RefusedCases))]
    public void Every_registry_the_corpus_refuses_fails_the_boot(string id)
    {
        using var directory = TemporaryDirectory.Create("startup-failure");
        var registryPath = RegistryCorpus.WriteTo(directory, id);

        var routePolicyError = TestEnvironment.BootFailureFor(registryPath);

        Assert.NotNull(routePolicyError);
    }

    /// <summary>
    /// The registry is a required deployment artifact, so each state it can
    /// arrive in is a startup failure with its own wording. A missing registry
    /// is the important one: it used to boot an application whose access model,
    /// SEO policy and no-store guarantee were all switched off.
    ///
    /// These two are the states no corpus case can declare, because neither is
    /// a registry: there is no case for a file that is not there, and none for
    /// a file with no content. Every state that *is* expressible as a registry
    /// is booted by the theory above, and the wording of a message the corpus
    /// cannot speak for both runtimes is pinned where the reader is tested.
    /// </summary>
    [Theory]
    [InlineData(TestEnvironment.MissingRegistry, "was not found")]
    [InlineData("routes.blank.json", "is empty")]
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

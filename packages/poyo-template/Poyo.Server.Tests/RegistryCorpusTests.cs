using Poyo.Framework;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The registry corpus, read by the server's side of it.
///
/// The rules a route's declaration must follow are written twice — here in C#
/// and in the framework package's route manager in TypeScript — because the
/// two runtimes refuse a bad registry at different moments, the CLI when it is
/// authored and the server when it is deployed. Two suites that each assert
/// their own wording cannot detect the wording drifting apart, which is how
/// the two came to disagree about an absent `access` and a `"controller": null`
/// in the first place. Reading one corpus makes the agreement falsifiable: a
/// rule added to one runtime with nothing pinning it on the other side fails
/// here, and fails the route manager's suite of the same name at the same time.
/// </summary>
public class RegistryCorpusTests
{
    public static TheoryData<string> Cases()
    {
        var data = new TheoryData<string>();
        foreach (var corpusCase in RegistryCorpus.All)
        {
            data.Add(corpusCase.Id);
        }

        return data;
    }

    /// <summary>
    /// The server's half of the corpus: every case earns the verdict the corpus
    /// records, and every case the server refuses names the facts the corpus
    /// says it names. The route manager's half is the same corpus read from
    /// `packages/poyo`, and the two suites are what make the agreement a fact
    /// rather than a claim.
    ///
    /// The reader is the seam under test rather than a booted host:
    /// `RoutePolicy.Load` is what the boot calls, and it is where every registry
    /// failure is decided. <see cref="StartupFailureTests"/> proves the same
    /// failures reach a host as boot failures, so this suite does not repeat a
    /// host start for each of the corpus's cases.
    /// </summary>
    [Theory]
    [MemberData(nameof(Cases))]
    public void The_server_gives_each_corpus_case_its_recorded_verdict(string id)
    {
        var corpusCase = RegistryCorpus.Require(id);
        using var directory = TemporaryDirectory.Create("registry-corpus");
        var registryPath = RegistryCorpus.WriteTo(directory, id);

        var thrown = Record.Exception(() => RoutePolicy.Load(registryPath));
        var failure = thrown as RoutePolicyException;

        if (corpusCase.ServerVerdict.Rejects)
        {
            Assert.True(
                thrown is not null,
                $"the server accepted a registry the corpus says it should reject: "
                    + $"{corpusCase.Note}");

            Assert.IsType<RoutePolicyException>(thrown);
        }
        else
        {
            Assert.Null(thrown);
        }

        // A case pinned to one side asserts its fragments of the side that
        // refuses it; there is no message on the side that accepts.
        if (corpusCase.ServerVerdict.Rejects)
        {
            foreach (var fragment in corpusCase.Message)
            {
                Assert.Contains(
                    fragment,
                    failure!.Message,
                    StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public void The_corpus_holds_cases_so_an_empty_or_relocated_corpus_is_not_a_vacuous_pass()
    {
        Assert.NotEmpty(RegistryCorpus.All);
    }

    [Fact]
    public void Every_case_records_why_it_exists()
    {
        var undocumented = RegistryCorpus.All
            .Where(corpusCase => string.IsNullOrWhiteSpace(corpusCase.Note))
            .Select(corpusCase => corpusCase.Id)
            .ToArray();

        Assert.Empty(undocumented);
    }

    /// <summary>
    /// A mis-spelled `dynamic` is the case the reader used to get wrong: the
    /// case-sensitive lookup missed it, so the deserializer's generic parse
    /// failure answered instead of the field that was actually wrong. The
    /// lookup is case-insensitive now and the message quotes the spelling the
    /// registry was written in, so the operator has the text to edit.
    /// </summary>
    [Fact]
    public void A_misspelled_dynamic_field_reports_the_dynamic_field_naming_the_route()
    {
        using var directory = TemporaryDirectory.Create("registry-corpus");
        var registryPath = RegistryCorpus.WriteTo(directory, "case-wrong-dynamic-value");

        var failure = Assert.Throws<RoutePolicyException>(() => RoutePolicy.Load(registryPath));

        Assert.Contains("invalid dynamic field", failure.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("'Dynamic'", failure.Message, StringComparison.Ordinal);
        Assert.Contains("route '/Home'", failure.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("is not a valid routes registry", failure.Message, StringComparison.OrdinalIgnoreCase);
    }
}

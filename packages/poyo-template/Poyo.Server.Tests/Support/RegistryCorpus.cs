using System.Text.Json;

namespace Poyo.Server.Tests.Support;

/// <summary>
/// One case from the registry corpus: a registry and the verdict it earns.
///
/// The corpus lives at the repository root and is read by this suite and by the
/// framework package's own route manager suite. The identity rules are written
/// twice — once here, once in TypeScript — because the two runtimes refuse a
/// bad registry at different moments. Two suites that each assert their own
/// wording cannot detect the wording drifting apart, so both read the same
/// cases instead: a rule added to one runtime and not the other turns one of
/// the two red.
/// </summary>
/// <param name="Id">
/// The case's file name, which is its identity: a case cannot be renamed
/// without the test names following it, and two cases cannot share an id.
/// </param>
/// <param name="RegistryText">The registry exactly as a case declares it.</param>
/// <param name="ServerVerdict">Whether the boot refuses it. A case's verdict
/// for the route manager is read by the route manager's suite, which is the
/// only side that asserts it; this one holds the server's, for the same
/// reason.</param>
/// <param name="Message">
/// Fragments the runtimes that refuse this case are expected to carry. A case
/// both refuse asserts them of both, so the two name the same facts; a case
/// pinned to one side asserts them of the side that refuses it, which is the
/// one whose message there is.
/// </param>
internal sealed record RegistryCorpusCase(
    string Id,
    string RegistryText,
    Verdict ServerVerdict,
    IReadOnlyList<string> Message,
    string Note);

internal static class RegistryCorpus
{
    private const string CorpusPath = "fixtures/registry";

    private static readonly Lazy<IReadOnlyList<RegistryCorpusCase>> Cases = new(Load);

    public static IReadOnlyList<RegistryCorpusCase> All => Cases.Value;

    public static RegistryCorpusCase Require(string id) =>
        All.Single(corpusCase => corpusCase.Id == id);

    /// <summary>
    /// Writes a case's registry into a temporary directory the caller owns and
    /// disposes, and returns its path. Both seams a corpus case reaches — the
    /// reader and the boot — take a path, so a test that exercises one has to
    /// put the case's registry on disk first.
    /// </summary>
    public static string WriteTo(TemporaryDirectory directory, string id) =>
        directory.WriteFile("routes.json", Require(id).RegistryText);

    private static IReadOnlyList<RegistryCorpusCase> Load() =>
        Directory
            .EnumerateFiles(CorpusDirectory(), "*.json")
            .OrderBy(file => file, StringComparer.Ordinal)
            .Select(Read)
            .ToArray();

    /// <summary>
    /// The corpus as it sits in the source tree, rather than a copy beside the
    /// test binaries, so a case edited is the case read. The corpus belongs to
    /// the repository, so it is found by walking up to the directory that holds
    /// it rather than by counting the levels back to the root — see
    /// <see cref="SourceDirectory"/>.
    /// </summary>
    private static string CorpusDirectory() => SourceDirectory.Nearest(CorpusPath);

    private static RegistryCorpusCase Read(string file)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(file));
        var body = document.RootElement;
        var id = Path.GetFileNameWithoutExtension(file);
        var shared = body.TryGetProperty("verdict", out _);
        var pinned = body.TryGetProperty("verdicts", out var verdicts);

        if (shared == pinned)
        {
            throw new InvalidOperationException(
                $"{id}: exactly one of \"verdict\" and \"verdicts\" must be declared.");
        }

        var verdict = shared ? ReadVerdict(body, id, "verdict") : ReadVerdict(verdicts, id, "server");

        return new RegistryCorpusCase(
            id,
            body.TryGetProperty("text", out var text)
                ? text.GetString() ?? string.Empty
                : body.GetProperty("registry").GetRawText(),
            verdict,
            body.TryGetProperty("message", out var message)
                ? message.EnumerateArray().Select(fragment => fragment.GetString() ?? string.Empty).ToArray()
                : [],
            body.TryGetProperty("note", out var note) ? note.GetString() ?? string.Empty : string.Empty);
    }

    private static Verdict ReadVerdict(JsonElement element, string id, string member)
    {
        if (!element.TryGetProperty(member, out var value)
            || value.ValueKind != JsonValueKind.String
            || !Verdict.TryParse(value.GetString(), out var verdict))
        {
            throw new InvalidOperationException(
                $"{id}: \"{member}\" must be one of \"{Verdict.Accept}\" or \"{Verdict.Reject}\".");
        }

        return verdict;
    }
}

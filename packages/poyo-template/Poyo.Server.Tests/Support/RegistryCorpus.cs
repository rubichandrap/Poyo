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
/// <param name="ServerVerdict">Whether the boot refuses it.</param>
/// <param name="ManagerVerdict">Whether the route manager refuses it.</param>
/// <param name="Message">
/// Fragments the runtimes that refuse this case are expected to carry. A case
/// both refuse asserts them of both, so the two name the same facts; a pinned
/// difference asserts them of the side that refuses it, which is the one whose
/// message there is.
/// </param>
internal sealed record RegistryCorpusCase(
    string Id,
    string RegistryText,
    string ServerVerdict,
    string ManagerVerdict,
    IReadOnlyList<string> Message,
    string Note)
{
    public bool ServerRejects => ServerVerdict == "reject";
    public bool IsPinned => ServerVerdict != ManagerVerdict;
}

internal static class RegistryCorpus
{
    public const string Reject = "reject";
    public const string Accept = "accept";

    private static readonly Lazy<IReadOnlyList<RegistryCorpusCase>> Cases = new(Load);

    public static IReadOnlyList<RegistryCorpusCase> All => Cases.Value;

    public static RegistryCorpusCase Require(string id) =>
        All.Single(corpusCase => corpusCase.Id == id);

    private static IReadOnlyList<RegistryCorpusCase> Load()
    {
        var directory = CorpusDirectory();

        if (!Directory.Exists(directory))
        {
            throw new DirectoryNotFoundException(
                $"The registry corpus is not at '{directory}'. Both the server suite and the " +
                "route manager suite read it, and neither ships a copy: it is the repository's.");
        }

        return Directory.EnumerateFiles(directory, "*.json")
            .OrderBy(file => file, StringComparer.Ordinal)
            .Select(Read)
            .ToArray();
    }

    /// <summary>
    /// The corpus as it sits in the source tree, rather than a copy beside the
    /// test binaries, so a case edited is the case read.
    /// </summary>
    private static string CorpusDirectory() => Path.Combine(
        AppContext.BaseDirectory,
        "..", "..", "..", "..", "..", "..",
        "fixtures", "registry");

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

        var verdict = shared ? Verdict(body, id, "verdict") : string.Empty;

        return new RegistryCorpusCase(
            id,
            body.TryGetProperty("text", out var text)
                ? text.GetString() ?? string.Empty
                : body.GetProperty("registry").GetRawText(),
            pinned ? Verdict(verdicts, id, "server") : verdict,
            pinned ? Verdict(verdicts, id, "manager") : verdict,
            body.TryGetProperty("message", out var message)
                ? message.EnumerateArray().Select(fragment => fragment.GetString() ?? string.Empty).ToArray()
                : [],
            body.TryGetProperty("note", out var note) ? note.GetString() ?? string.Empty : string.Empty);
    }

    private static string Verdict(JsonElement element, string id, string member)
    {
        if (!element.TryGetProperty(member, out var value)
            || value.ValueKind != JsonValueKind.String
            || value.GetString() is not (Accept or Reject))
        {
            throw new InvalidOperationException(
                $"{id}: \"{member}\" must be one of \"{Accept}\" or \"{Reject}\".");
        }

        return value.GetString()!;
    }
}

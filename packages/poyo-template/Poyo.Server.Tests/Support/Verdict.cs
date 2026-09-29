namespace Poyo.Server.Tests.Support;

/// <summary>
/// What a runtime does with a registry a corpus case declares: read it, or
/// refuse it. A case spells this as one of two words, and the framework
/// package's suite reads the same two words as a TypeScript union, so this is
/// that union on this side — the two runtimes' agreement is asserted by reading
/// the same file, and a verdict neither side can spell wrongly is what makes
/// the reading worth anything.
/// </summary>
internal readonly record struct Verdict
{
    public static Verdict Accept { get; } = new(rejects: false);

    public static Verdict Reject { get; } = new(rejects: true);

    private Verdict(bool rejects) => Rejects = rejects;

    /// <summary>Whether the runtime refuses the registry.</summary>
    public bool Rejects { get; }

    /// <summary>
    /// Reads the word a case records. A verdict is parsed rather than cast, so
    /// a typo in a case fails the suite that reads it instead of reading as
    /// "accept" and quietly turning the case into a no-op.
    /// </summary>
    public static bool TryParse(string? word, out Verdict verdict)
    {
        switch (word)
        {
            case "accept":
                verdict = Accept;
                return true;
            case "reject":
                verdict = Reject;
                return true;
            default:
                verdict = Accept;
                return false;
        }
    }

    /// <summary>The word a case records this verdict as.</summary>
    public override string ToString() => Rejects ? "reject" : "accept";
}

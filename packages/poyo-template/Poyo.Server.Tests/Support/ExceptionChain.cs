namespace Poyo.Server.Tests.Support;

internal static class ExceptionChain
{
    /// <summary>
    /// A boot failure reaches the test wrapped in whatever the host adds on its
    /// way out, so the exception under test is somewhere in the chain rather
    /// than at the top of it.
    /// </summary>
    public static IEnumerable<Exception> Unwrap(Exception failure)
    {
        for (var current = failure; current is not null; current = current.InnerException)
        {
            yield return current;
        }
    }
}

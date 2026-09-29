namespace Poyo.Server.Tests.Support;

/// <summary>
/// A path in this repository's own source tree, found by walking up from the
/// test binaries rather than by counting the levels back to it.
///
/// The number of levels between a build output and the project that produced it
/// is an accident of the project file and the SDK's layout conventions, so a
/// path spelled as `"..", "..", ".."` fails here the moment either changes, and
/// it fails by not finding a file that is still where it always was. The walk
/// instead ends at the first ancestor that holds the directory being looked for,
/// which makes the path a fact about the repository rather than about the build.
/// </summary>
internal static class SourceDirectory
{
    /// <summary>
    /// The path of <paramref name="marker"/> — a path relative to the
    /// repository — taken at the nearest ancestor of the test output that holds
    /// it.
    /// </summary>
    public static string Nearest(string marker)
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory);
             directory is not null;
             directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, marker);

            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new DirectoryNotFoundException(
            $"No directory at or above '{AppContext.BaseDirectory}' holds '{marker}'. The tests read "
            + "the repository's own files rather than a copy beside their binaries, so a case edited "
            + "is the case read.");
    }
}

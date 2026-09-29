namespace Poyo.Server.Tests.Support;

/// <summary>
/// A temporary directory that removes itself, for a test that needs a real
/// file at a real path. Deployments resolve a registry from a host-named
/// location, so proving anything about that resolution needs somewhere for the
/// host to point — and a path under the project tree would be a file another
/// test could see.
/// </summary>
internal sealed class TemporaryDirectory : IDisposable
{
    private readonly string _path;

    private TemporaryDirectory(string path)
    {
        _path = path;
    }

    /// <summary>The directory's own path, to build file names inside it.</summary>
    public string Path => _path;

    public static TemporaryDirectory Create(string purpose)
    {
        var path = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(), $"poyo-{purpose}-{Guid.NewGuid():N}");

        Directory.CreateDirectory(path);

        return new TemporaryDirectory(path);
    }

    /// <summary>
    /// Writes a file in the directory and returns its full path, so a test can
    /// hand the host one variable and read one file.
    /// </summary>
    public string WriteFile(string fileName, string contents)
    {
        var filePath = System.IO.Path.Combine(_path, fileName);
        File.WriteAllText(filePath, contents);

        return filePath;
    }

    public void Dispose() => Directory.Delete(_path, recursive: true);
}

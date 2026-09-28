namespace Poyo.Server.Tests.Support;

/// <summary>
/// A copy of a registry fixture that no reader can open for as long as this
/// object is alive: the file is copied to a temporary directory and held with
/// an exclusive handle, which is how an unreadable registry is produced
/// without depending on file permissions, which behave differently per user
/// and per platform.
/// </summary>
internal sealed class LockedRegistry : IDisposable
{
    private readonly FileStream _hold;
    private readonly string _directory;

    public string RegistryPath { get; }

    private LockedRegistry(string registryPath, FileStream hold, string directory)
    {
        RegistryPath = registryPath;
        _hold = hold;
        _directory = directory;
    }

    public static LockedRegistry CreateFrom(string fixturePath)
    {
        var directory = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(), $"poyo-locked-registry-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);

        var registryPath = System.IO.Path.Combine(directory, "routes.json");
        File.Copy(fixturePath, registryPath);

        return new LockedRegistry(
            registryPath,
            File.Open(registryPath, FileMode.Open, FileAccess.Read, FileShare.None),
            directory);
    }

    public void Dispose()
    {
        _hold.Dispose();
        Directory.Delete(_directory, recursive: true);
    }
}

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
    private readonly TemporaryDirectory _directory;
    private readonly FileStream _hold;

    private LockedRegistry(TemporaryDirectory directory, string registryPath, FileStream hold)
    {
        _directory = directory;
        RegistryPath = registryPath;
        _hold = hold;
    }

    public string RegistryPath { get; }

    public static LockedRegistry CreateFrom(string fixturePath)
    {
        var directory = TemporaryDirectory.Create("locked-registry");
        var registryPath = directory.WriteFile("routes.json", File.ReadAllText(fixturePath));

        return new LockedRegistry(
            directory,
            registryPath,
            File.Open(registryPath, FileMode.Open, FileAccess.Read, FileShare.None));
    }

    /// <summary>
    /// The handle goes first: the copy cannot be deleted while this process
    /// still holds it open.
    /// </summary>
    public void Dispose()
    {
        _hold.Dispose();
        _directory.Dispose();
    }
}

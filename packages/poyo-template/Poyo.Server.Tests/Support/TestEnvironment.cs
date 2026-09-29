using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Framework;

namespace Poyo.Server.Tests.Support;

internal static class TestEnvironment
{
    /// <summary>
    /// The fixture name that stands for a registry that is not there. The
    /// registry is a required deployment artifact, so its absence is a case the
    /// boot-failure table asserts, and it has no fixture file by definition.
    /// </summary>
    public const string MissingRegistry = "routes.absent.json";

    private static bool _configured;

    private static readonly object Gate = new();

    public static string FixturePath(string fileName) =>
        fileName == MissingRegistry
            ? MissingRegistryPath()
            : Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Fixtures", fileName);

    /// <summary>
    /// A registry path that does not exist. The registry is a required
    /// deployment artifact, so a deployment that lost it must fail to start.
    /// </summary>
    public static string MissingRegistryPath() =>
        Path.Combine(Path.GetTempPath(), "poyo-registry-absent", "routes.json");

    /// <summary>
    /// A readable copy of a registry fixture that cannot be read while the
    /// returned lock is alive.
    /// </summary>
    public static LockedRegistry LockRegistry(string fixtureFileName) =>
        LockedRegistry.CreateFrom(FixturePath(fixtureFileName));

    /// <summary>
    /// Boots with a registry at the given path and returns the route policy
    /// failure the host reported, or null when the host reported something
    /// else. A boot failure reaches the test wrapped in whatever the host adds
    /// on its way out, so the exception under test is somewhere in the chain.
    /// </summary>
    public static RoutePolicyException? BootFailureFor(string registryPath)
    {
        var thrown = Record.Exception(() => CreateServerAndStart(registryPath));
        Assert.NotNull(thrown);
        return ExceptionChain.Unwrap(thrown).OfType<RoutePolicyException>().FirstOrDefault();
    }

    public static string TemplateRoutesPath() =>
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "routes.json");

    /// <summary>
    /// Program.cs runs top-level environment checks and reads the registry
    /// during entry point execution, so the registry path must be injected as
    /// an environment variable before the host is created. Host creation is
    /// gated on a lock and started eagerly, because the process-wide variable
    /// would otherwise race across parallel test classes.
    /// </summary>
    public static WebApplicationFactory<Program> CreateServerAndStart(string routesJsonPath)
    {
        return CreateServer(routesJsonPath: routesJsonPath, startClient: true);
    }

    public static WebApplicationFactory<Program> CreateServer(
        string? routesJsonPath = null,
        string? environment = null,
        Action<Microsoft.AspNetCore.Hosting.IWebHostBuilder>? configureBuilder = null,
        bool startClient = false)
    {
        lock (Gate)
        {
            EnsureConfigured();
            Environment.SetEnvironmentVariable("Routes__JsonPath", routesJsonPath ?? TemplateRoutesPath());
            if (environment != null)
            {
                Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", environment);
                if (environment == "Development")
                {
                    Environment.SetEnvironmentVariable("Vite__Server__DevServerUrl", "http://localhost:5173");
                }
            }

            var factory = new WebApplicationFactory<Program>();
            var customizedFactory = configureBuilder != null
                ? factory.WithWebHostBuilder(configureBuilder)
                : factory;

            if (startClient)
            {
                customizedFactory.CreateClient();
            }

            return customizedFactory;
        }
    }

    private static void EnsureConfigured()
    {
        if (_configured)
        {
            return;
        }

        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Testing");
        Environment.SetEnvironmentVariable("AllowedHosts", "*");
        Environment.SetEnvironmentVariable("Vite__Server__AutoRun", "false");
        Environment.SetEnvironmentVariable("Vite__Server__Port", "5173");
        _configured = true;
    }
}

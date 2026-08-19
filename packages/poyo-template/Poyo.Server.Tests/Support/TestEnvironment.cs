using Microsoft.AspNetCore.Mvc.Testing;

namespace Poyo.Server.Tests.Support;

internal static class TestEnvironment
{
    private static bool _configured;

    private static readonly object Gate = new();

    public static string FixturePath(string fileName) =>
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Fixtures", fileName);

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

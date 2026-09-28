using System.Net;
using System.Text.Json;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The process environment owns the hosting environment. A deployment variable
/// always wins; the environment file is a development convenience that fills
/// gaps and never overrides, and it is read only when the process says
/// development or says nothing.
///
/// The seam is a real published application, booted as its own process with
/// the variables one particular deployment sets. An in-process host could not
/// prove this: the bootstrap reads the process environment, so every test would
/// be racing every other test for the same variables.
///
/// The hosting environment is observed through the OpenAPI document route,
/// which the application maps only in development. That is the same switch the
/// deployment risk runs on — developer exception pages, the Vite development
/// integration and the absence of HTTPS redirection all key off it — so the
/// test does not need a hook of its own to see which way it went. What it
/// observes is development against not-development, which is the whole of the
/// distinction these requirements turn on.
/// </summary>
public class HostingEnvironmentTests
{
    private const string OpenApiDocument = "/openapi/v1.json";

    /// <summary>
    /// A real process variable survives a conflicting value in a
    /// <em>development</em> environment file. This is the mirror of the
    /// behaviour that used to hold: the loader overrode process variables, so
    /// a file nobody owned decided the deployment.
    ///
    /// The launch is a development one on purpose — that is the only case in
    /// which the file is read at all, so it is the only case in which this can
    /// be observed.
    /// </summary>
    [Fact]
    public async Task A_process_variable_survives_a_conflicting_value_in_the_environment_file()
    {
        using var environmentFile = EnvironmentFile.Containing(
            """
            AllowedHosts=*
            """);

        await AssertServesWith(
            // The launch names the hosts it answers for. The file says it
            // answers for every host, which is what the loader used to make
            // true. Host filtering is the observable: a process-owned
            // AllowedHosts rejects the loopback host this test connects by.
            DevelopmentLaunch(
                ("AllowedHosts", "poyo.test"),
                ("EnvFile", environmentFile.FilePath)),
            HttpStatusCode.BadRequest);
    }

    /// <summary>
    /// A development environment file still supplies the values the launch
    /// does not. The other half of the contract, and the one a developer's
    /// daily workflow depends on: filling gaps is only useful if the gaps
    /// really do get filled.
    /// </summary>
    [Fact]
    public async Task A_development_environment_file_supplies_the_values_the_launch_does_not()
    {
        using var environmentFile = EnvironmentFile.Containing(
            """
            AllowedHosts=poyo.test
            """);

        await AssertServesWith(
            // Nothing in the launch names the allowed hosts, so without the
            // file the application answers every host — and with it, only the
            // host the file gave it.
            DevelopmentLaunch(("EnvFile", environmentFile.FilePath)),
            HttpStatusCode.BadRequest);
    }

    /// <summary>
    /// A development environment file that names the hosting environment is
    /// ignored. The environment is read from the process before the file is
    /// considered, so a typo in the file cannot redirect the deployment.
    /// </summary>
    [Fact]
    public async Task A_development_environment_file_cannot_set_the_hosting_environment()
    {
        using var environmentFile = EnvironmentFile.Containing(
            """
            ASPNETCORE_ENVIRONMENT=Production
            """);

        await AssertBootedAs(
            DevelopmentLaunch(("EnvFile", environmentFile.FilePath)),
            isDevelopment: true);
    }

    /// <summary>
    /// The environment file cannot redirect a development host by way of the
    /// <em>other</em> environment variable. Both are process variables and
    /// `DOTNET_ENVIRONMENT` wins in the framework's own configuration, so a
    /// file that set the one the host did not use would still decide the
    /// environment — through the back door, in either direction.
    /// </summary>
    [Theory]
    [InlineData("DOTNET_ENVIRONMENT", "ASPNETCORE_ENVIRONMENT")]
    [InlineData("ASPNETCORE_ENVIRONMENT", "DOTNET_ENVIRONMENT")]
    public async Task The_environment_file_cannot_redirect_a_host_that_used_the_other_name(
        string the_host_sets,
        string the_file_sets)
    {
        using var environmentFile = EnvironmentFile.Containing(
            $$"""
              {{the_file_sets}}=Production
              """);

        await AssertBootedAs(
            DevelopmentLaunch(
                (the_host_sets, "Development"),
                (the_file_sets, null),
                ("EnvFile", environmentFile.FilePath)),
            isDevelopment: true);
    }

    /// <summary>
    /// A production boot with an environment file present honors the real
    /// environment. The file is not read at all, so developer exception pages,
    /// the Vite development integration and the absence of HTTPS redirection
    /// cannot be enabled by accident.
    /// </summary>
    [Fact]
    public async Task A_production_boot_ignores_a_present_environment_file()
    {
        using var environmentFile = EnvironmentFile.Containing(
            """
            ASPNETCORE_ENVIRONMENT=Development
            Vite__Server__DevServerUrl=http://localhost:5173
            Vite__Server__Port=5173
            """);

        await AssertBootedAs(
            Variables(("ASPNETCORE_ENVIRONMENT", "Production"), ("EnvFile", environmentFile.FilePath)),
            isDevelopment: false);
    }

    /// <summary>
    /// An unset hosting environment is production, which is the framework's
    /// own default and the safe direction. A deployment that forgot the
    /// variable gets a production boot rather than a failed deploy or a
    /// development one.
    /// </summary>
    [Fact]
    public async Task An_unset_hosting_environment_boots_as_production()
    {
        await AssertBootedAs(
            Variables(("ASPNETCORE_ENVIRONMENT", null), ("DOTNET_ENVIRONMENT", null)),
            isDevelopment: false);
    }

    /// <summary>
    /// A production host needs no Vite variables. The port-integrality gate
    /// and the Vite variable requirements are development requirements, and a
    /// deployment that does not own the client's dev server must not fail on
    /// them.
    /// </summary>
    [Fact]
    public async Task A_production_host_needs_no_vite_variables()
    {
        await AssertBootedAs(
            Variables(
                ("ASPNETCORE_ENVIRONMENT", "Production"),
                ("Vite__Server__AutoRun", null),
                ("Vite__Server__Port", null),
                ("Vite__Server__DevServerUrl", null)),
            isDevelopment: false);
    }

    /// <summary>
    /// A missing development variable still fails loudly. There is no safe
    /// default for the dev server's URL, so a broken development setup has to
    /// be obvious immediately rather than at the first request that needs it.
    /// </summary>
    [Fact]
    public async Task A_missing_development_variable_fails_loudly()
    {
        var failure = await PublishedServer.StartExpectingBootFailure(
            Variables(
                ("ASPNETCORE_ENVIRONMENT", "Development"),
                ("Vite__Server__DevServerUrl", null)));

        Assert.NotEqual(0, failure.ExitCode);
        Assert.Contains("Vite__Server__DevServerUrl", failure.Output, StringComparison.Ordinal);
    }

    /// <summary>
    /// The development variables the bootstrap requires are named by
    /// development tooling, so a fresh clone runs from source with no
    /// environment file present. The profile is read rather than restated
    /// here, so dropping a variable from it fails this test.
    ///
    /// The one substitution is `Vite__Server__AutoRun`, which the profile sets
    /// to true: honouring it would start a Vite dev server inside the test
    /// run. It is a client dev-server detail, not a hosting-environment one.
    /// </summary>
    [Fact]
    public async Task A_fresh_clone_runs_from_source_with_no_environment_file_present()
    {
        var profile = LaunchProfileEnvironment();
        profile["Vite__Server__AutoRun"] = "false";
        profile["EnvFile"] = Path.Combine(
            Path.GetTempPath(), $"poyo-fresh-clone-{Guid.NewGuid():N}", ".env");

        await AssertBootedAs(profile, isDevelopment: true);
    }

    private static async Task AssertBootedAs(
        IReadOnlyDictionary<string, string?> variables,
        bool isDevelopment)
    {
        using var server = await PublishedServer.Start(PublishedServer.PublishDirectory, variables);
        using var document = await server.CreateClient().GetAsync(OpenApiDocument);

        Assert.Equal(
            isDevelopment ? HttpStatusCode.OK : HttpStatusCode.NotFound,
            document.StatusCode);
    }

    private static async Task AssertServesWith(
        IReadOnlyDictionary<string, string?> variables,
        HttpStatusCode expected)
    {
        using var server = await PublishedServer.Start(PublishedServer.PublishDirectory, variables);
        using var document = await server.CreateClient().GetAsync("/Login");

        Assert.Equal(expected, document.StatusCode);
    }

    /// <summary>
    /// The variables a run-from-source launch sets, as named by the project's
    /// launch profile. A test that exercises the environment file has to be a
    /// development launch, because that is the only launch that reads it — and
    /// a development launch is one the development variables actually satisfy.
    /// The allowed hosts are among the things it does not set, so a file can
    /// supply them.
    /// </summary>
    private static Dictionary<string, string?> DevelopmentLaunch(
        params (string Name, string? Value)[] variables) =>
        Variables(
        [
            ("ASPNETCORE_ENVIRONMENT", "Development"),
            ("DOTNET_ENVIRONMENT", null),
            ("AllowedHosts", null),
            ("Vite__Server__AutoRun", "false"),
            ("Vite__Server__Port", "5173"),
            ("Vite__Server__DevServerUrl", "http://localhost:5173"),
            .. variables,
        ]);

    /// <summary>
    /// The environment a run-from-source launch supplies, as named by the
    /// project's launch profile.
    /// </summary>
    private static Dictionary<string, string?> LaunchProfileEnvironment()
    {
        using var launchSettings = JsonDocument.Parse(File.ReadAllText(
            Path.Combine(
                AppContext.BaseDirectory, "..", "..", "..", "..", "Poyo.Server", "Properties", "launchSettings.json")));

        return launchSettings.RootElement
            .GetProperty("profiles")
            .GetProperty("Poyo.Server")
            .GetProperty("environmentVariables")
            .EnumerateObject()
            .ToDictionary(
                property => property.Name,
                property => (string?)property.Value.GetString());
    }

    /// <summary>
    /// The variables one particular deployment sets. A null value removes a
    /// variable, which is how a test says "this host does not set it", and a
    /// later entry wins over an earlier one with the same name, so a helper
    /// can supply defaults that the caller overrides.
    /// </summary>
    private static Dictionary<string, string?> Variables(params (string Name, string? Value)[] variables)
    {
        var set = new Dictionary<string, string?>();
        foreach (var (name, value) in variables)
        {
            set[name] = value;
        }

        return set;
    }

    /// <summary>
    /// An environment file on disk with the given contents, at a path a
    /// deployment can name. The bootstrap only reads a file a host points it
    /// at, so this is how a test says "this deployment has an environment
    /// file".
    /// </summary>
    private sealed class EnvironmentFile : IDisposable
    {
        private readonly string _directory;

        public string FilePath { get; }

        private EnvironmentFile(string filePath, string directory)
        {
            FilePath = filePath;
            _directory = directory;
        }

        public static EnvironmentFile Containing(string contents)
        {
            var directory = Path.Combine(
                Path.GetTempPath(), $"poyo-environment-file-{Guid.NewGuid():N}");
            Directory.CreateDirectory(directory);

            var filePath = Path.Combine(directory, ".env");
            File.WriteAllText(filePath, contents);

            return new EnvironmentFile(filePath, directory);
        }

        public void Dispose() => Directory.Delete(_directory, recursive: true);
    }
}

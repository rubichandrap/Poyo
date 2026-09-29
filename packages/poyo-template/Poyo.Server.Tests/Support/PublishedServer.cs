using System.Diagnostics;
using System.Net.Sockets;
using System.Text;

namespace Poyo.Server.Tests.Support;

/// <summary>
/// A real `dotnet publish` output, booted as its own process. This is the only
/// seam that can prove the deployment claim: the registry has to travel with
/// the published artifact and resolve from a directory the host chooses, not
/// from the one the developer happens to run from.
/// </summary>
internal sealed class PublishedServer : IDisposable
{
    private const string AssemblyFileName = "Poyo.Server.dll";

    /// <summary>How long a boot gets to answer or exit before it is undecided.</summary>
    private static readonly TimeSpan BootDeadline = TimeSpan.FromSeconds(60);

    private static readonly IReadOnlyDictionary<string, string?> NoVariables = new Dictionary<string, string?>();

    private static readonly Lazy<string> PublishOutput = new(Publish, LazyThreadSafetyMode.ExecutionAndPublication);

    private readonly Process _process;
    private readonly StringBuilder _logs = new();

    private PublishedServer(Process process, Uri origin)
    {
        _process = process;
        Origin = origin;
    }

    public static string PublishDirectory => PublishOutput.Value;

    public Uri Origin { get; }

    /// <summary>
    /// Starts the published application with <paramref name="workingDirectory"/>
    /// as its process working directory and waits until it serves. The
    /// environment names no registry location: the published artifact is
    /// expected to carry it.
    /// </summary>
    /// <param name="environment">
    /// The variables this particular deployment sets, layered over the
    /// baseline deployment environment. A null value removes a variable, which
    /// is how a test says "this host does not set it".
    /// </param>
    public static async Task<PublishedServer> Start(
        string workingDirectory,
        IReadOnlyDictionary<string, string?>? environment = null)
    {
        var origin = new Uri($"http://127.0.0.1:{FreePort()}");
        var server = Launch(workingDirectory, origin, environment);

        using (var deadline = new CancellationTokenSource(BootDeadline))
        {
            switch (await server.WaitForBootAsync(deadline.Token))
            {
                case BootOutcome.Serving:
                    return server;
                case BootOutcome.Failed:
                    throw new InvalidOperationException(
                        $"The published application exited with code {server.ExitCode} " +
                        $"before serving. Output:\n{server.CapturedOutput()}");
                default:
                    throw new InvalidOperationException(
                        $"The published application never served. Output:\n{server.CapturedOutput()}");
            }
        }
    }

    /// <summary>
    /// Starts the published application on the variables the deployment sets
    /// and waits for it to fail to start, returning how it failed. A boot that
    /// has to fail loudly is a contract, and the message it fails with is part
    /// of that contract — so the assertion needs the output, not just a
    /// non-zero exit code.
    /// </summary>
    public static async Task<BootFailure> StartExpectingBootFailure(
        IReadOnlyDictionary<string, string?> environment)
    {
        var origin = new Uri($"http://127.0.0.1:{FreePort()}");
        using var server = Launch(PublishDirectory, origin, environment);

        using var deadline = new CancellationTokenSource(BootDeadline);
        switch (await server.WaitForBootAsync(deadline.Token))
        {
            case BootOutcome.Failed:
                return new BootFailure(server.ExitCode, server.CapturedOutput());
            case BootOutcome.Serving:
                // A boot that is required to fail must fail quickly, and a boot
                // that serves instead is a failure of the thing under test
                // rather than a wait worth sitting through.
                throw new InvalidOperationException(
                    "The published application served instead of failing to start. Output:\n" +
                    server.CapturedOutput());
            default:
                throw new InvalidOperationException(
                    "The published application neither served nor failed within the deadline. Output:\n" +
                    server.CapturedOutput());
        }
    }

    /// <summary>
    /// How a boot that was required to fail actually failed.
    /// </summary>
    public sealed record BootFailure(int ExitCode, string Output);

    private static PublishedServer Launch(
        string workingDirectory,
        Uri origin,
        IReadOnlyDictionary<string, string?>? environment)
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo("dotnet")
            {
                WorkingDirectory = workingDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            },
        };

        process.StartInfo.ArgumentList.Add(Path.Combine(PublishDirectory, AssemblyFileName));
        process.StartInfo.ArgumentList.Add("--urls");
        process.StartInfo.ArgumentList.Add(origin.ToString());
        foreach (var (name, value) in DeploymentEnvironment())
        {
            process.StartInfo.Environment[name] = value;
        }

        foreach (var (name, value) in environment ?? NoVariables)
        {
            process.StartInfo.Environment[name] = value;
        }

        var server = new PublishedServer(process, origin);
        process.OutputDataReceived += (_, e) => server.Capture(e);
        process.ErrorDataReceived += (_, e) => server.Capture(e);
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return server;
    }

    /// <summary>
    /// The environment a deployment sets, and nothing a developer sets. Both
    /// names of the hosting environment are owned here: the server reads
    /// `DOTNET_ENVIRONMENT` in preference to `ASPNETCORE_ENVIRONMENT`, so a
    /// `DOTNET_ENVIRONMENT` exported on the machine running these tests would
    /// otherwise become the answer for the published process. The registry
    /// location is explicitly cleared for the same reason — the in-process
    /// hosts in this test run set it for themselves, and that must not become
    /// the answer for the published process, which is expected to carry its
    /// own registry. `EnvFile` is cleared with them: it is the one variable a
    /// developer's shell most often carries, and a stray path here would make
    /// the published process read a file it was never meant to see, which is
    /// the very precedence the tests above are about.
    /// </summary>
    private static Dictionary<string, string?> DeploymentEnvironment() => new()
    {
        ["ASPNETCORE_ENVIRONMENT"] = "Production",
        ["DOTNET_ENVIRONMENT"] = null,
        ["ASPNETCORE_URLS"] = null,
        ["AllowedHosts"] = "*",
        ["EnvFile"] = null,
        ["Routes__JsonPath"] = null,
        ["Vite__Server__AutoRun"] = "false",
        ["Vite__Server__Port"] = "5173",
    };

    private void Capture(DataReceivedEventArgs e)
    {
        lock (_logs)
        {
            _logs.AppendLine(e.Data);
        }
    }

    private string CapturedOutput()
    {
        lock (_logs)
        {
            return _logs.ToString();
        }
    }

    /// <summary>
    /// One poll loop for both callers. Waiting for a server to serve and
    /// waiting for it to fail are the same question with opposite verdicts, so
    /// they share a loop: the only thing that differs is how each caller reads
    /// the outcome, and keeping that in the callers is what lets the two tests
    /// assert opposite things about one mechanism.
    ///
    /// Any HTTP answer counts as serving. A host that names its own allowed
    /// hosts rejects the loopback host these tests connect by, so "answered"
    /// and "served a page" are different questions and only the caller's
    /// assertions can tell the second one.
    /// </summary>
    private async Task<BootOutcome> WaitForBootAsync(CancellationToken deadline)
    {
        using var client = CreateClient();

        while (true)
        {
            if (_process.HasExited)
            {
                return BootOutcome.Failed;
            }

            try
            {
                using var response = await client.GetAsync("/Login", deadline);
                return response is not null
                    ? BootOutcome.Serving
                    : BootOutcome.Undecided;
            }
            catch (HttpRequestException)
            {
                // Not listening yet.
            }
            catch (TaskCanceledException) when (deadline.IsCancellationRequested)
            {
                return BootOutcome.Undecided;
            }

            await Task.Delay(200, deadline);
        }
    }

    private enum BootOutcome
    {
        /// <summary>It answered HTTP, one way or another.</summary>
        Serving,

        /// <summary>The process exited, so it cannot be serving now.</summary>
        Failed,

        /// <summary>Neither, before the deadline ran out.</summary>
        Undecided,
    }

    /// <summary>
    /// A client that does not keep a cookie jar: the demo session cookie is
    /// marked secure and the published application is exercised over plain
    /// http, so a test that needs to be signed in relays the cookie itself.
    /// </summary>
    public HttpClient CreateClient() => new(new HttpClientHandler
    {
        AllowAutoRedirect = false,
        UseCookies = false,
    })
    {
        BaseAddress = Origin,
    };

    /// <summary>
    /// Whether the process has finished, whether it succeeded or not.
    /// </summary>
    public bool HasExited => _process.HasExited;

    public int ExitCode => _process.ExitCode;


    public void Dispose()
    {
        if (!_process.HasExited)
        {
            _process.Kill(entireProcessTree: true);
        }

        _process.Dispose();
    }

    private static int FreePort()
    {
        using var probe = new TcpListener(System.Net.IPAddress.Loopback, 0);
        probe.Start();
        var port = ((System.Net.IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    private static string Publish()
    {
        var projectFile = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Poyo.Server", "Poyo.Server.csproj"));

        // Outside the project's own $(OutDir) on purpose: a build, a clean or a
        // second `dotnet test` deletes that directory, and it would do so under
        // servers these tests have already booted.
        var outputDirectory = Path.Combine(
            Path.GetTempPath(), $"poyo-published-{Guid.NewGuid():N}");

        if (Directory.Exists(outputDirectory))
        {
            Directory.Delete(outputDirectory, recursive: true);
        }

        var startInfo = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = AppContext.BaseDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        startInfo.ArgumentList.Add("publish");
        startInfo.ArgumentList.Add(projectFile);
        startInfo.ArgumentList.Add("--configuration");
        startInfo.ArgumentList.Add("Release");
        startInfo.ArgumentList.Add("--output");
        startInfo.ArgumentList.Add(outputDirectory);
        startInfo.ArgumentList.Add("--nologo");

        using var publish = Process.Start(startInfo)
            ?? throw new InvalidOperationException("dotnet publish did not start.");

        var log = publish.StandardOutput.ReadToEnd() + publish.StandardError.ReadToEnd();
        publish.WaitForExit();

        if (publish.ExitCode != 0)
        {
            throw new InvalidOperationException($"dotnet publish failed:\n{log}");
        }

        return outputDirectory;
    }
}

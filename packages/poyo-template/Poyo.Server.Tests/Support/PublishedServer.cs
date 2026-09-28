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
    public static async Task<PublishedServer> Start(string workingDirectory)
    {
        var port = FreePort();
        var origin = new Uri($"http://127.0.0.1:{port}");

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

        var server = new PublishedServer(process, origin);
        process.OutputDataReceived += server.Capture;
        process.ErrorDataReceived += server.Capture;
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        await server.WaitUntilServingAsync();
        return server;
    }

    /// <summary>
    /// The environment a deployment sets, and nothing a developer sets. The
    /// registry location is explicitly cleared: the in-process hosts in this
    /// test run set it for themselves, and that must not become the answer for
    /// the published process, which is expected to carry its own registry.
    /// </summary>
    private static Dictionary<string, string?> DeploymentEnvironment() => new()
    {
        ["ASPNETCORE_ENVIRONMENT"] = "Production",
        ["ASPNETCORE_URLS"] = null,
        ["AllowedHosts"] = "*",
        ["Routes__JsonPath"] = null,
        ["Vite__Server__AutoRun"] = "false",
        ["Vite__Server__Port"] = "5173",
    };

    private void Capture(object sender, DataReceivedEventArgs e)
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

    private async Task WaitUntilServingAsync()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        using var client = CreateClient();

        while (!deadline.IsCancellationRequested)
        {
            if (_process.HasExited)
            {
                throw new InvalidOperationException(
                    $"The published application exited with code {_process.ExitCode} " +
                    $"before serving. Output:\n{CapturedOutput()}");
            }

            try
            {
                using var response = await client.GetAsync("/Login", deadline.Token);
                if (response.IsSuccessStatusCode)
                {
                    return;
                }
            }
            catch (HttpRequestException)
            {
                // Not listening yet.
            }
            catch (TaskCanceledException) when (deadline.IsCancellationRequested)
            {
                break;
            }

            await Task.Delay(200, deadline.Token);
        }

        throw new InvalidOperationException(
            $"The published application never served. Output:\n{CapturedOutput()}");
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
        var outputDirectory = Path.Combine(AppContext.BaseDirectory, "publish");

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

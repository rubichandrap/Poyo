using DotNetEnv;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Hosting;

namespace Poyo.Framework;

/// <summary>
/// The host bootstrap the framework owns: the hosting environment read from
/// the process before anything else loads, the development-only environment
/// file, and a content root that follows the application's content rather than
/// the directory a host happened to start it in (ADR 0017, ADR 0014 amendment,
/// ADR 0021).
///
/// A generated project keeps only what it owns in <c>Program.cs</c>; fixes to
/// this behaviour arrive with an update of the framework package.
/// </summary>
public static class PoyoHost
{
    /// <summary>
    /// Creates the application builder with the framework's bootstrap applied.
    /// The hosting environment is read from the process before anything loads,
    /// so the environment file can never decide the environment it is
    /// conditional on; the file is read only when the process says development
    /// or says nothing, and only fills gaps; and the content root is the
    /// application's own unless the host names one.
    /// </summary>
    public static WebApplicationBuilder CreateBuilder(string[] args)
    {
        // The process environment owns the hosting environment (ADR 0017).
        // A host may name it with either variable and the framework gives
        // DOTNET_ENVIRONMENT precedence, so read them the way the framework
        // reads them — otherwise a host using the general name would still be
        // at the file's mercy.
        string? dotnetEnvironment = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
        string? aspnetEnvironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        string? hostingEnvironment = dotnetEnvironment ?? aspnetEnvironment;

        // The environment file is a development convenience, never a
        // deployment requirement. The loader defaults to overriding, so
        // filling gaps is stated here rather than inherited: a real deployment
        // variable always wins.
        string? envFile = Environment.GetEnvironmentVariable("EnvFile");

        if (IsUnsetOrDevelopment(hostingEnvironment)
            && !string.IsNullOrWhiteSpace(envFile)
            && File.Exists(envFile))
        {
            Env.Load(envFile, LoadOptions.NoClobber());

            // Filling gaps would otherwise cover the hosting environment when
            // the process left it out, which is the one value this file must
            // never supply however it spells its absence.
            if (dotnetEnvironment is null)
            {
                Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", null);
            }

            if (aspnetEnvironment is null)
            {
                Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", null);
            }
        }

        // The content root is where appsettings.json and wwwroot are.
        // ASP.NET's default is the working directory, which holds them when
        // the host starts the application in its own directory (a publish
        // output) or in the project directory (`dotnet run`, `dotnet watch`,
        // the build output run from the project). A host that started it
        // anywhere else (a service manager's default is "/") got pages without
        // their bundle, styles or icon, no appsettings.json and, from "/", file
        // watchers across the whole filesystem before it could listen. So the
        // working directory stays the content root when it holds the
        // application's appsettings.json; otherwise the application's own
        // directory is, unless the host names one (ADR 0014 amendment).
        bool hostNamesContentRoot =
            !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_CONTENTROOT"))
            || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DOTNET_CONTENTROOT"))
            || args.Any(arg => arg.TrimStart('-', '/').StartsWith("contentRoot", StringComparison.OrdinalIgnoreCase));
        bool workingDirectoryHoldsTheApplication =
            File.Exists(Path.Combine(Directory.GetCurrentDirectory(), "appsettings.json"));

        return WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = hostNamesContentRoot || workingDirectoryHoldsTheApplication
                ? null
                : AppContext.BaseDirectory,
        });
    }

    /// <summary>
    /// Unset counts as development because an unset environment is production,
    /// and a deployment that forgot to name its environment still gets this
    /// file's other values. The environment itself stays out of the file's
    /// reach either way; the operator-facing fix is to set it on the host.
    /// </summary>
    private static bool IsUnsetOrDevelopment(string? hostingEnvironment) =>
        string.IsNullOrWhiteSpace(hostingEnvironment)
        || string.Equals(hostingEnvironment, Environments.Development, StringComparison.OrdinalIgnoreCase);
}

using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi;

namespace Poyo.Server.Hosting;

/// <summary>
/// Exports the OpenAPI specification snapshot in-process at server startup.
/// Eliminates loopback HTTP network requests and circular deadlocks during dev boot.
/// </summary>
public sealed class OpenApiSnapshotExportHostedService : IHostedService
{
    private readonly IOpenApiDocumentProvider _documentProvider;
    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<OpenApiSnapshotExportHostedService> _logger;

    public OpenApiSnapshotExportHostedService(
        [FromKeyedServices("v1")] IOpenApiDocumentProvider documentProvider,
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<OpenApiSnapshotExportHostedService> logger)
    {
        _documentProvider = documentProvider;
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (IsExportDisabled())
        {
            _logger.LogInformation("OpenAPI snapshot export is disabled by configuration.");
            return;
        }

        var exportPath = ResolveExportPath();

        try
        {
            var document = await _documentProvider.GetOpenApiDocumentAsync(cancellationToken);

            var snapshot = new StringWriter();
            document.SerializeAsV3(new OpenApiJsonWriter(snapshot, new OpenApiJsonWriterSettings
            {
                Terse = false,
            }));
            var json = snapshot.ToString();

            // The committed snapshot is formatted by the repository's formatter,
            // not by this writer, so a byte comparison would rewrite it on every
            // boot. Only a change to the document itself is written; an
            // unchanged API leaves the tracked file alone.
            if (File.Exists(exportPath)
                && DescribesSameDocument(await File.ReadAllTextAsync(exportPath, cancellationToken), json))
            {
                _logger.LogInformation("OpenAPI snapshot at '{ExportPath}' is up to date.", exportPath);
                return;
            }

            var directory = Path.GetDirectoryName(exportPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var utf8WithoutBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            await File.WriteAllTextAsync(exportPath, json, utf8WithoutBom, cancellationToken);

            _logger.LogInformation("Exported OpenAPI snapshot to '{ExportPath}'.", exportPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to export OpenAPI snapshot to '{ExportPath}'.", exportPath);
            throw;
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>
    /// Whether two JSON texts describe the same document, ignoring formatting.
    /// A file that is not JSON is never the same document, so it is replaced.
    /// </summary>
    internal static bool DescribesSameDocument(string existing, string exported)
    {
        try
        {
            return JsonNode.DeepEquals(JsonNode.Parse(existing), JsonNode.Parse(exported));
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private bool IsExportDisabled()
    {
        var rawConfig = _configuration["OpenApi:ExportSnapshot"]
            ?? _configuration["OPENAPI_EXPORT_SNAPSHOT"];

        if (!string.IsNullOrWhiteSpace(rawConfig) && bool.TryParse(rawConfig, out var isEnabled))
        {
            return !isEnabled;
        }

        return false;
    }

    private string ResolveExportPath()
    {
        var explicitPath = _configuration["OPENAPI_EXPORT_PATH"]
            ?? _configuration["OpenApi:ExportPath"];

        if (!string.IsNullOrWhiteSpace(explicitPath))
        {
            return Path.GetFullPath(explicitPath);
        }

        var root = Directory.GetParent(_environment.ContentRootPath)?.FullName
            ?? _environment.ContentRootPath;

        return Path.Combine(root, "poyo.client", "openapi", "openapi.json");
    }
}

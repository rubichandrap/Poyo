using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class OpenApiSnapshotIntegrationTests : IDisposable
{
    private readonly string _tempDir;

    public OpenApiSnapshotIntegrationTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "poyo-integration-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    [Fact]
    public void Server_boot_in_development_exports_valid_openapi_snapshot()
    {
        var targetFile = Path.Combine(_tempDir, "exported-openapi.json");

        using var factory = TestEnvironment.CreateServer(
            environment: "Development",
            configureBuilder: builder =>
            {
                builder.UseSetting("OPENAPI_EXPORT_PATH", targetFile);
            },
            startClient: true);

        Assert.True(File.Exists(targetFile), $"Expected snapshot file at {targetFile}");

        var json = File.ReadAllText(targetFile);
        using var doc = JsonDocument.Parse(json);

        Assert.Equal("3.0.4", doc.RootElement.GetProperty("openapi").GetString());
        var paths = doc.RootElement.GetProperty("paths");
        Assert.True(paths.TryGetProperty("/api/Auth/Login", out _), "Expected /api/Auth/Login in OpenAPI snapshot");
    }

    [Fact]
    public void Server_boot_with_export_disabled_does_not_export_snapshot()
    {
        var targetFile = Path.Combine(_tempDir, "disabled-openapi.json");

        using var factory = TestEnvironment.CreateServer(
            environment: "Development",
            configureBuilder: builder =>
            {
                builder.UseSetting("OPENAPI_EXPORT_PATH", targetFile);
                builder.UseSetting("OpenApi:ExportSnapshot", "false");
            },
            startClient: true);

        Assert.False(File.Exists(targetFile), "Snapshot should not be exported when OpenApi:ExportSnapshot=false");
    }

    [Fact]
    public void Server_boot_in_production_does_not_export_snapshot()
    {
        var targetFile = Path.Combine(_tempDir, "prod-openapi.json");

        using var factory = TestEnvironment.CreateServer(
            environment: "Production",
            configureBuilder: builder =>
            {
                builder.UseSetting("OPENAPI_EXPORT_PATH", targetFile);
            },
            startClient: true);

        Assert.False(File.Exists(targetFile), "Snapshot should not be exported in Production environment");
    }
}

using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.OpenApi;
using Poyo.Server.Hosting;

namespace Poyo.Server.Tests;

public class OpenApiSnapshotExportHostedServiceTests : IDisposable
{
    private readonly string _tempDir;

    public OpenApiSnapshotExportHostedServiceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "poyo-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    private sealed class FakeOpenApiDocumentProvider : IOpenApiDocumentProvider
    {
        private readonly OpenApiDocument _doc;

        public FakeOpenApiDocumentProvider(OpenApiDocument doc)
        {
            _doc = doc;
        }

        public Task<OpenApiDocument> GetOpenApiDocumentAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult(_doc);
        }
    }

    private sealed class FakeHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Poyo.Server";
        public string ContentRootPath { get; set; } = "/tmp/fake";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    [Fact]
    public async Task Exports_openapi_snapshot_formatted_without_bom_to_specified_path()
    {
        var targetFile = Path.Combine(_tempDir, "sub", "openapi.json");
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["OPENAPI_EXPORT_PATH"] = targetFile,
            })
            .Build();

        var doc = new OpenApiDocument
        {
            Info = new OpenApiInfo { Title = "Test API", Version = "v1" }
        };

        var provider = new FakeOpenApiDocumentProvider(doc);
        var env = new FakeHostEnvironment { ContentRootPath = _tempDir };
        var service = new OpenApiSnapshotExportHostedService(
            provider,
            config,
            env,
            NullLogger<OpenApiSnapshotExportHostedService>.Instance);

        await service.StartAsync(CancellationToken.None);

        Assert.True(File.Exists(targetFile));

        var bytes = await File.ReadAllBytesAsync(targetFile);
        // Verify UTF-8 without BOM: EF BB BF must not be present at the start
        if (bytes.Length >= 3)
        {
            Assert.False(bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF, "File contains UTF-8 BOM");
        }

        var json = Encoding.UTF8.GetString(bytes);
        using var jsonDoc = JsonDocument.Parse(json);
        Assert.Equal("3.0.4", jsonDoc.RootElement.GetProperty("openapi").GetString());
        Assert.Equal("Test API", jsonDoc.RootElement.GetProperty("info").GetProperty("title").GetString());
        // Verify formatted (contains newlines)
        Assert.Contains("\n", json);
    }

    [Fact]
    public async Task Skips_export_when_configured_false()
    {
        var targetFile = Path.Combine(_tempDir, "openapi.json");
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["OPENAPI_EXPORT_PATH"] = targetFile,
                ["OpenApi:ExportSnapshot"] = "false",
            })
            .Build();

        var doc = new OpenApiDocument
        {
            Info = new OpenApiInfo { Title = "Test API", Version = "v1" }
        };

        var provider = new FakeOpenApiDocumentProvider(doc);
        var env = new FakeHostEnvironment { ContentRootPath = _tempDir };
        var service = new OpenApiSnapshotExportHostedService(
            provider,
            config,
            env,
            NullLogger<OpenApiSnapshotExportHostedService>.Instance);

        await service.StartAsync(CancellationToken.None);

        Assert.False(File.Exists(targetFile));
    }

    [Fact]
    public async Task Skips_export_when_env_var_override_is_false()
    {
        var targetFile = Path.Combine(_tempDir, "openapi.json");
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["OPENAPI_EXPORT_PATH"] = targetFile,
                ["OPENAPI_EXPORT_SNAPSHOT"] = "false",
            })
            .Build();

        var doc = new OpenApiDocument
        {
            Info = new OpenApiInfo { Title = "Test API", Version = "v1" }
        };

        var provider = new FakeOpenApiDocumentProvider(doc);
        var env = new FakeHostEnvironment { ContentRootPath = _tempDir };
        var service = new OpenApiSnapshotExportHostedService(
            provider,
            config,
            env,
            NullLogger<OpenApiSnapshotExportHostedService>.Instance);

        await service.StartAsync(CancellationToken.None);

        Assert.False(File.Exists(targetFile));
    }

    [Fact]
    public async Task Resolves_default_export_path_relative_to_content_root()
    {
        // Setup a mock root structure: ContentRootPath is <root>/Poyo.Server
        var rootDir = Path.Combine(_tempDir, "myproject");
        var serverDir = Path.Combine(rootDir, "Poyo.Server");
        var expectedSnapshot = Path.Combine(rootDir, "poyo.client", "openapi", "openapi.json");
        Directory.CreateDirectory(serverDir);

        var config = new ConfigurationBuilder().Build();
        var doc = new OpenApiDocument
        {
            Info = new OpenApiInfo { Title = "Test API", Version = "v1" }
        };

        var provider = new FakeOpenApiDocumentProvider(doc);
        var env = new FakeHostEnvironment { ContentRootPath = serverDir };
        var service = new OpenApiSnapshotExportHostedService(
            provider,
            config,
            env,
            NullLogger<OpenApiSnapshotExportHostedService>.Instance);

        await service.StartAsync(CancellationToken.None);

        Assert.True(File.Exists(expectedSnapshot));
    }
}

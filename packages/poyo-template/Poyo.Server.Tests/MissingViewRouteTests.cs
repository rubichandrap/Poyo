using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class MissingViewRouteTests : IClassFixture<MissingViewServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly MissingViewServerFixture _fixture;

    public MissingViewRouteTests(MissingViewServerFixture fixture)
    {
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    private HttpClient CreateClient() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });

    [Fact]
    public async Task Missing_view_does_not_block_startup()
    {
        var response = await CreateClient().GetAsync("/Serves");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Missing_view_fails_at_request_time()
    {
        var response = await CreateClient().GetAsync("/MissingView");

        // The removed fallback route was never the error path: the exception
        // handler writes its own response, with no status-code-pages middleware
        // in between, so an action that throws still answers as the handler
        // wrote it.
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(500, body.RootElement.GetProperty("code").GetInt32());
        Assert.False(
            string.IsNullOrWhiteSpace(body.RootElement.GetProperty("data").GetString()));
        PageResponseAssertions.AssertPrivateNoStore(response);
    }

    [Fact]
    public async Task Missing_view_answers_both_representations_with_the_same_logged_error()
    {
        var client = CreateClient();
        var loggedBefore = _fixture.Logs.Entries.Count;

        var document = await client.GetAsync("/MissingView");
        var descriptor = await client.SendAsync(NavigationRequests.Descriptor("/MissingView"));

        var documentError = await PageResponseAssertions.ReadServerErrorAsync(document);
        var descriptorError = await PageResponseAssertions.ReadServerErrorAsync(descriptor);

        Assert.Equal(
            documentError.GetProperty("code").GetInt32(),
            descriptorError.GetProperty("code").GetInt32());
        Assert.Equal(
            documentError.GetProperty("data").GetString(),
            descriptorError.GetProperty("data").GetString());

        // Both representations fail in the view lookup and reach the project's
        // exception handler: one error entry each, naming the requested URL.
        // (The framework's exception handler middleware logs its own entry too,
        // so the assertion names the handler that owns the response shape.)
        var errors = _fixture.Logs.Entries
            .Skip(loggedBefore)
            .Where(entry => entry.Level == LogLevel.Error)
            .Where(entry => entry.Category.Contains("GlobalExceptionHandler"))
            .ToList();
        Assert.Equal(2, errors.Count);
        Assert.All(errors, entry => Assert.Contains("/MissingView", entry.Message));
    }
}

public sealed class MissingViewServerFixture : IDisposable
{
    public MissingViewServerFixture()
    {
        Logs = new CapturingLoggerProvider();
        Factory = TestEnvironment.CreateServer(
            TestEnvironment.FixturePath("routes.missing-view.json"),
            startClient: true,
            configureBuilder: builder => builder.ConfigureServices(services =>
                services.AddSingleton<ILoggerProvider>(Logs)));
    }

    public WebApplicationFactory<Program> Factory { get; }

    internal CapturingLoggerProvider Logs { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

using System.Diagnostics;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Poyo.Framework;

namespace Poyo.Server.Tests;

public class HtmlHelperExtensionsTests
{
    [Fact]
    public void PoyoPageData_safely_embeds_page_data()
    {
        using var document = JsonDocument.Parse(
            "{\"content\":\"</script><script>alert(1)</script>\"}");
        var viewData = CreateViewData();
        var controller = new TestController { ViewData = viewData };

        PageResult.For(
            controller,
            viewPath: null,
            route: null,
            document.RootElement.GetRawText());

        using var serviceProvider = CreateServiceProvider();
        var helper = CreateHtmlHelper(serviceProvider, viewData);

        var output = Render(helper.PoyoPageData());

        Assert.Equal(
            "<script>window.SERVER_DATA = {\"content\":\"\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E\"};</script>",
            output);
    }

    [Fact]
    public void PoyoPageData_returns_empty_when_page_data_is_absent()
    {
        var viewData = CreateViewData();
        using var serviceProvider = CreateServiceProvider();
        var helper = CreateHtmlHelper(serviceProvider, viewData);

        var content = helper.PoyoPageData();

        Assert.Same(HtmlString.Empty, content);
    }

    [Fact]
    public void PoyoPageData_returns_empty_when_controller_page_data_is_null()
    {
        var viewData = CreateViewData();
        var controller = new TestController { ViewData = viewData };
        PageResult.For(controller, viewPath: null, route: null, explicitPageData: null);
        using var serviceProvider = CreateServiceProvider();
        var helper = CreateHtmlHelper(serviceProvider, viewData);

        var content = helper.PoyoPageData();

        Assert.Same(HtmlString.Empty, content);
    }

    [Fact]
    public void PoyoPageData_warns_when_legacy_server_data_key_is_present()
    {
        var viewData = CreateViewData();
        viewData["ServerData"] = null;
        var entries = new List<LogEntry>();
        using var loggerFactory = new RecordingLoggerFactory(entries);
        using var serviceProvider = CreateServiceProvider(Environments.Development, loggerFactory);
        var helper = CreateHtmlHelper(serviceProvider, viewData);

        _ = helper.PoyoPageData();

        var entry = Assert.Single(entries, candidate => candidate.Level == LogLevel.Warning);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Contains("ServerData", entry.Message);
        Assert.Contains("unsupported", entry.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PoyoPageData_warns_and_keeps_controller_data_when_legacy_key_is_present()
    {
        using var document = JsonDocument.Parse("{\"value\":42}");
        var viewData = CreateViewData();
        var controller = new TestController { ViewData = viewData };
        PageResult.For(
            controller,
            viewPath: null,
            route: null,
            document.RootElement.GetRawText());
        viewData["ServerData"] = "legacy";
        var entries = new List<LogEntry>();
        using var loggerFactory = new RecordingLoggerFactory(entries);
        using var serviceProvider = CreateServiceProvider(Environments.Development, loggerFactory);
        var helper = CreateHtmlHelper(serviceProvider, viewData);

        var content = helper.PoyoPageData();

        var entry = Assert.Single(entries, candidate => candidate.Level == LogLevel.Warning);
        Assert.Contains("ServerData", entry.Message);
        Assert.Contains("unsupported", entry.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(
            "<script>window.SERVER_DATA = {\"value\":42};</script>",
            Render(content));
    }

    [Fact]
    public void PoyoPageData_does_not_warn_outside_development()
    {
        var viewData = CreateViewData();
        viewData["ServerData"] = null;
        var entries = new List<LogEntry>();
        using var loggerFactory = new RecordingLoggerFactory(entries);
        using var serviceProvider = CreateServiceProvider(Environments.Production, loggerFactory);
        var helper = CreateHtmlHelper(serviceProvider, viewData);

        _ = helper.PoyoPageData();

        Assert.DoesNotContain(entries, entry => entry.Level == LogLevel.Warning);
    }

    private static ViewDataDictionary CreateViewData() =>
        new(new EmptyModelMetadataProvider(), new ModelStateDictionary());

    private static ServiceProvider CreateServiceProvider() =>
        CreateServiceProvider(Environments.Production, null);

    private static ServiceProvider CreateServiceProvider(
        string environmentName,
        ILoggerFactory? loggerFactory)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var diagnosticListener = new DiagnosticListener("Poyo.Server.Tests");
        services.AddSingleton(diagnosticListener);
        services.AddSingleton<DiagnosticSource>(diagnosticListener);
        services.AddControllersWithViews();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment
        {
            EnvironmentName = environmentName,
        });
        if (loggerFactory is not null)
        {
            services.AddSingleton(loggerFactory);
        }

        return services.BuildServiceProvider();
    }

    private static IHtmlHelper CreateHtmlHelper(
        ServiceProvider serviceProvider,
        ViewDataDictionary viewData)
    {
        var httpContext = new DefaultHttpContext
        {
            RequestServices = serviceProvider,
        };
        var helper = serviceProvider.GetRequiredService<IHtmlHelper>();
        var viewContext = new ViewContext
        {
            HttpContext = httpContext,
            ViewData = viewData,
        };
        ((IViewContextAware)helper).Contextualize(viewContext);
        return helper;
    }

    private static string Render(IHtmlContent content)
    {
        using var writer = new StringWriter();
        content.WriteTo(writer, HtmlEncoder.Default);
        return writer.ToString();
    }

    private sealed class TestController : Controller
    {
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Poyo.Server.Tests";
        public string ContentRootPath { get; set; } = "/tmp/poyo-tests";
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private sealed record LogEntry(LogLevel Level, string Message);

    private sealed class RecordingLoggerFactory(List<LogEntry> entries) : ILoggerFactory
    {
        public ILogger CreateLogger(string categoryName) => new RecordingLogger(entries);

        public void AddProvider(ILoggerProvider provider)
        {
        }

        public void Dispose()
        {
        }
    }

    private sealed class RecordingLogger(List<LogEntry> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            entries.Add(new LogEntry(logLevel, formatter(state, exception)));
        }
    }
}

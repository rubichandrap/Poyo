using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// A view adds SSR-only head elements with @section Head (ADR 0020). They are
/// part of the document a load renders and of nothing else: a navigation
/// descriptor never runs the view.
/// </summary>
public class HeadSectionTests : IClassFixture<HeadSectionServerFixture>
{
    private readonly HttpClient _client;

    public HeadSectionTests(HeadSectionServerFixture fixture)
    {
        _client = fixture.Factory.CreateClient();
    }

    private static string HeadOf(string document)
    {
        var start = document.IndexOf("<head>", StringComparison.Ordinal);
        var end = document.IndexOf("</head>", StringComparison.Ordinal);
        Assert.True(start >= 0 && end > start, "the document has a head");
        return document[start..end];
    }

    [Fact]
    public async Task A_view_section_renders_into_the_document_head()
    {
        var response = await _client.GetAsync("/HeadSection");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var head = HeadOf(await response.Content.ReadAsStringAsync());
        Assert.Contains(
            "<link rel=\"canonical\" href=\"https://example.test/head-section\" data-poyo-seo />",
            head);
    }

    [Fact]
    public async Task A_view_without_the_section_renders_without_it()
    {
        var response = await _client.GetAsync("/Plain");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("canonical", HeadOf(await response.Content.ReadAsStringAsync()));
    }

    [Fact]
    public async Task A_navigation_descriptor_does_not_run_the_view_or_its_section()
    {
        var response = await _client.SendAsync(NavigationRequests.Descriptor("/HeadSection"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        using var descriptor = JsonDocument.Parse(body);
        Assert.Equal("HeadSection", descriptor.RootElement.GetProperty("name").GetString());
        Assert.DoesNotContain("canonical", body);
    }
}

public sealed class HeadSectionServerFixture : IDisposable
{
    public HeadSectionServerFixture()
    {
        Factory = TestEnvironment.CreateServer(
            TestEnvironment.FixturePath("routes.head-section.json"),
            startClient: true,
            configureBuilder: builder =>
            {
                // The view that declares the section is compiled into this
                // assembly; make it an application part so the app finds it.
                builder.ConfigureServices(services =>
                {
                    services.AddControllersWithViews()
                        .PartManager.ApplicationParts.Add(
                            new CompiledRazorAssemblyPart(typeof(HeadSectionServerFixture).Assembly));
                });
            });
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

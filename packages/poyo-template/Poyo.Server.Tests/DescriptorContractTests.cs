using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Poyo.Framework;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The dynamic-navigation wire contract as ADR 0009 fixes it for ticket 01:
/// the navigation header earns a JSON page descriptor with a Vary header;
/// the SEO/access model and the document payload are identical between the
/// two representations. (The registry's dynamic opt-out belongs to ticket 02.)
/// </summary>
public class DescriptorContractTests : IClassFixture<DescriptorServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public DescriptorContractTests(DescriptorServerFixture fixture)
    {
        _factory = fixture.Factory;
    }

    private HttpClient CreateClient() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });

    private static HttpRequestMessage DescriptorRequest(string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(
            PageResult.NavigationHeaderName,
            PageResult.NavigationHeaderValue);
        return request;
    }

    [Fact]
    public async Task Document_request_renders_the_page_as_before()
    {
        var response = await CreateClient().GetAsync("/Public");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        // One URL, two representations: caches must key on the header.
        Assert.Equal(PageResult.NavigationHeaderName, response.Headers.Vary.ToString());
    }

    [Fact]
    public async Task Descriptor_request_returns_json_page_descriptor()
    {
        var response = await CreateClient().SendAsync(DescriptorRequest("/Public"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(PageResult.NavigationHeaderName, response.Headers.Vary.ToString());

        var descriptor = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Public", descriptor.GetProperty("name").GetString());
        Assert.Equal(
            "Public Page Title",
            descriptor.GetProperty("seo").GetProperty("title").GetString());
        Assert.Equal(
            "Public OG Title",
            descriptor.GetProperty("seo").GetProperty("meta").GetProperty("og:title").GetString());
    }

    [Fact]
    public async Task Descriptor_request_against_opt_out_route_returns_document_with_vary()
    {
        var client = CreateClient();
        var request = DescriptorRequest("/OptOut");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.StartsWith("text/html", response.Content.Headers.ContentType?.ToString());
        Assert.Contains(PageResult.NavigationHeaderName, response.Headers.Vary);
        var html = await response.Content.ReadAsStringAsync();
        Assert.Contains("<!DOCTYPE html>", html);
    }

    [Fact]
    public async Task Descriptor_page_data_is_byte_identical_to_the_document_payload()
    {
        var client = CreateClient();

        var document = await client.GetAsync("/StaticData");
        Assert.Equal(HttpStatusCode.OK, document.StatusCode);
        var documentBody = await document.Content.ReadAsStringAsync();

        var descriptor = await client.SendAsync(DescriptorRequest("/StaticData"));
        Assert.Equal(HttpStatusCode.OK, descriptor.StatusCode);
        var descriptorBody = await descriptor.Content.ReadAsStringAsync();

        // window.SERVER_DATA on the document...
        var marker = "window.SERVER_DATA = ";
        var start = documentBody.IndexOf(marker, StringComparison.Ordinal) + marker.Length;
        var end = documentBody.IndexOf(';', start);
        var documentJson = documentBody[start..end].Trim();

        // ...equals the descriptor's pageData, so the client store seeds
        // identically on first load and on navigation. (A deterministic
        // payload view, because a per-request timestamp would always differ
        // between two separate requests.)
        var pageData = JsonDocument.Parse(descriptorBody).RootElement
            .GetProperty("pageData");
        Assert.True(
            JsonElement.DeepEquals(
                JsonDocument.Parse(documentJson).RootElement,
                pageData),
            $"document payload {documentJson} != descriptor pageData {pageData}");
        Assert.Equal("deterministic", pageData.GetProperty("message").GetString());
        Assert.Equal(42, pageData.GetProperty("answer").GetInt32());
    }

    [Fact]
    public async Task Registry_seo_reaches_the_descriptor()
    {
        var response = await CreateClient().SendAsync(DescriptorRequest("/Public"));

        var descriptor = await response.Content.ReadFromJsonAsync<JsonElement>();
        var seo = descriptor.GetProperty("seo");
        Assert.Equal("Public Page Title", seo.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Descriptor_for_route_without_server_data_has_null_page_data()
    {
        var response = await CreateClient().SendAsync(DescriptorRequest("/Guest"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var descriptor = await response.Content.ReadFromJsonAsync<JsonElement>();
        var pageData = descriptor.GetProperty("pageData");
        Assert.Equal(JsonValueKind.Null, pageData.ValueKind);
    }

    [Fact]
    public async Task Missing_view_descriptor_is_not_found_not_server_error()
    {
        var response = await CreateClient().SendAsync(DescriptorRequest("/MissingView"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Protected_descriptor_challenges_anonymous_callers()
    {
        var response = await CreateClient().SendAsync(DescriptorRequest("/Protected"));

        // RouteAccessFilter runs before the result executes: the challenge —
        // not a descriptor payload — is what an anonymous caller receives.
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Login", response.Headers.Location?.AbsolutePath);
    }

    [Fact]
    public async Task Guest_descriptor_redirects_authenticated_callers()
    {
        var client = CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var response = await client.SendAsync(DescriptorRequest("/Guest"));

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/Dashboard", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task PoyoPage_gives_custom_controller_both_representations()
    {
        var client = CreateClient();
        await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });

        var document = await client.GetAsync("/Custom");
        Assert.Equal(HttpStatusCode.OK, document.StatusCode);
        var documentBody = await document.Content.ReadAsStringAsync();

        var descriptor = await client.SendAsync(DescriptorRequest("/Custom"));
        Assert.Equal(HttpStatusCode.OK, descriptor.StatusCode);

        // The view carries the data-page marker; the descriptor carries the
        // controller-provided payload.
        Assert.Contains("data-page-name=\"Home\"", documentBody);

        var pageData = JsonDocument.Parse(
            await descriptor.Content.ReadAsStringAsync()).RootElement
            .GetProperty("pageData");
        Assert.Equal("hello from PoyoPage", pageData.GetProperty("message").GetString());
        Assert.Equal(42, pageData.GetProperty("answer").GetInt32());
    }
}

public sealed class DescriptorServerFixture : IDisposable
{
    public DescriptorServerFixture()
    {
        Factory = TestEnvironment.CreateServer(
            TestEnvironment.FixturePath("routes.descriptor.json"),
            startClient: true,
            configureBuilder: builder =>
            {
                // The custom-controller test lives in this assembly; make it
                // an application part so the app's MVC discovers it.
                builder.ConfigureServices(services =>
                {
                    services.AddControllersWithViews()
                        .PartManager.ApplicationParts.Add(
                            new AssemblyPart(typeof(DescriptorServerFixture).Assembly));
                });
            });
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

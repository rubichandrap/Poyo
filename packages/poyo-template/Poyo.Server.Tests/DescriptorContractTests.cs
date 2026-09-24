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
/// The dynamic-navigation wire contract as ADR 0009 fixes the descriptor shape
/// and ADR 0012 fixes Page data parity: the navigation header earns a JSON page
/// descriptor with a Vary header, and the document payload is structurally
/// equal to the descriptor payload. (The registry's dynamic opt-out belongs to
/// ticket 02.)
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
    public async Task Document_and_descriptor_page_data_are_structurally_equal()
    {
        var (documentBody, pageData) = await GetPageDataRepresentationsAsync(CreateClient());
        var documentJson = ExtractDocumentPageData(documentBody);
        using var document = JsonDocument.Parse(documentJson);

        Assert.True(
            JsonElement.DeepEquals(document.RootElement, pageData),
            $"document payload {documentJson} != descriptor pageData {pageData}");
        Assert.Equal("deterministic", pageData.GetProperty("message").GetString());
        Assert.Equal(42, pageData.GetProperty("answer").GetInt32());
    }

    [Fact]
    public async Task Page_data_escapes_script_terminators_without_changing_json()
    {
        var (documentBody, pageData) = await GetPageDataRepresentationsAsync(CreateClient());

        Assert.Contains("\\u003C/script\\u003E", documentBody, StringComparison.Ordinal);
        Assert.DoesNotContain("</script><script>alert", documentBody, StringComparison.Ordinal);
        Assert.Equal(
            "</script><script>alert('xss')</script>",
            pageData.GetProperty("markup").GetString());
    }

    [Fact]
    public async Task Page_data_preserves_adversarial_characters()
    {
        var (_, pageData) = await GetPageDataRepresentationsAsync(CreateClient());

        Assert.Equal("Saved; 3 items", pageData.GetProperty("note").GetString());
        Assert.Equal(
            "&amp; &lt; &gt; &#39; &quot;",
            pageData.GetProperty("entities").GetString());
        Assert.Equal(
            "quotes: \" apostrophe: ' backslash: \\ slash: / newline:\n tab:\t",
            pageData.GetProperty("special").GetString());
    }

    [Fact]
    public async Task PoyoPage_rejects_a_string_that_is_not_json()
    {
        var client = CreateClient();
        await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "demo",
            password = "password",
        });

        var response = await client.GetAsync("/BadData");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
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
    public async Task Missing_view_descriptor_is_not_found_for_custom_controller_routes()
    {
        var response = await CreateClient().SendAsync(DescriptorRequest("/CustomMissingView"));

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

    private static async Task<(string DocumentBody, JsonElement PageData)> GetPageDataRepresentationsAsync(
        HttpClient client)
    {
        var document = await client.GetAsync("/StaticData");
        Assert.Equal(HttpStatusCode.OK, document.StatusCode);
        var documentBody = await document.Content.ReadAsStringAsync();

        var descriptor = await client.SendAsync(DescriptorRequest("/StaticData"));
        Assert.Equal(HttpStatusCode.OK, descriptor.StatusCode);
        using var descriptorDocument = JsonDocument.Parse(
            await descriptor.Content.ReadAsStringAsync());

        return (documentBody, descriptorDocument.RootElement.GetProperty("pageData").Clone());
    }

    private static string ExtractDocumentPageData(string documentBody)
    {
        const string marker = "window.SERVER_DATA = ";
        var markerStart = documentBody.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(markerStart >= 0, "The document does not contain Page data.");

        var start = markerStart + marker.Length;
        var end = documentBody.IndexOf("</script>", start, StringComparison.Ordinal);
        Assert.True(end > start, "The document Page data script is not closed.");

        var json = documentBody[start..end].Trim();
        if (json.EndsWith(';'))
        {
            json = json[..^1].TrimEnd();
        }

        return json;
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

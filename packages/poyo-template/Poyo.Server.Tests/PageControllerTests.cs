using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Poyo.Framework;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The page controller's own guard: it serves a registry route or nothing.
///
/// Endpoint routing matches a declared path as an ASP.NET route template while
/// every policy filter and the descriptor resolve the registry literally, so a
/// template-shaped declaration could reach this action without a registry
/// route. The registry now refuses such a declaration at boot, and this 404 is
/// the defense in depth for the request that finds no route anyway: answering
/// the view would serve a page that skipped access, SEO and no-store.
/// </summary>
public class PageControllerTests
{
    private const string RegistryText = """
        [
          {
            "path": "/Home",
            "name": "Home",
            "files": {
              "react": "src/pages/Home/index.page.tsx",
              "view": "Views/Home/Index.cshtml"
            }
          }
        ]
        """;

    [Fact]
    public void Index_answers_404_when_no_registry_route_resolves_for_the_request()
    {
        using var directory = TemporaryDirectory.Create("page-controller");
        var policy = RoutePolicy.Load(directory.WriteFile("routes.json", RegistryText));
        var services = new ServiceCollection().AddSingleton(policy).BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        httpContext.Request.Path = "/Users/42";
        var controller = new PageController
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };

        var result = controller.Index(viewPath: null);

        Assert.IsType<NotFoundResult>(result);
    }
}

/// <summary>
/// The page controller resolves the request path against the registry, so the
/// form it reads is the route's identity on the wire. `PathString` re-encodes a
/// path for a link (`/Café` becomes `/Caf%C3%A9`), while the request that
/// arrives is decoded, so reading anything but `Path.Value` answers 404 for
/// every route whose path holds a non-ASCII character or a space.
///
/// `%2F` is the one escape ASP.NET leaves encoded in the request path, which is
/// why the registry accepts it: it reaches the lookup as declared.
/// </summary>
public class PageControllerDecodedPathTests : IClassFixture<DecodedPathServerFixture>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PageControllerDecodedPathTests(DecodedPathServerFixture fixture)
    {
        _factory = fixture.Factory;
    }

    private HttpClient CreateClient() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });

    [Theory]
    [InlineData("/Café")]
    [InlineData("/My Page")]
    [InlineData("/Users%2F42")]
    public async Task A_route_whose_path_is_not_plain_ascii_still_renders(string path)
    {
        var response = await CreateClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}

public sealed class DecodedPathServerFixture : IDisposable
{
    public DecodedPathServerFixture()
    {
        Factory = TestEnvironment.CreateServerAndStart(
            TestEnvironment.FixturePath("routes.unicode-path.json"));
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

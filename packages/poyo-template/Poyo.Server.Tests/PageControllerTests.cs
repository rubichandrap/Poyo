using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
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

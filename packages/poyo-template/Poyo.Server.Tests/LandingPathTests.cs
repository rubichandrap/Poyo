using System.Net;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// Routes:LandingPath is where a signed-in visitor to a guest route is sent.
/// Each way it can be wrong used to show only once such a visitor arrived: a
/// guest route redirected to itself forever, and an undeclared path landed on
/// a 404. Both are boot failures now, checked against the registry.
/// </summary>
public class LandingPathTests
{
    private static string TemplateRegistry => TestEnvironment.TemplateRoutesPath();

    [Theory]
    [InlineData("/Login", "redirected to it again, forever")]
    [InlineData("/login/", "redirected to it again, forever")]
    [InlineData("/Nowhere", "names no route in the registry")]
    [InlineData("Dashboard", "neither an app path")]
    [InlineData("~/Register", "redirected to it again, forever")]
    public void A_landing_path_that_cannot_serve_the_guest_redirect_fails_the_boot(
        string landingPath,
        string messagePart)
    {
        var failure = TestEnvironment.BootFailureFor(TemplateRegistry, landingPath);

        Assert.NotNull(failure);
        Assert.Contains("Routes:LandingPath", failure.Message);
        Assert.Contains(messagePart, failure.Message);
    }

    [Fact]
    public void The_default_landing_path_must_exist_when_guest_routes_do()
    {
        using var directory = TemporaryDirectory.Create("landing-default");
        var registry = directory.WriteFile("routes.json", """
            [
              { "path": "/", "name": "Home", "access": "guest",
                "files": { "react": "src/pages/Home/index.page.tsx", "view": "Views/Home/Index.cshtml" } }
            ]
            """);

        var failure = TestEnvironment.BootFailureFor(registry);

        Assert.NotNull(failure);
        Assert.Contains("'/Dashboard' is the default", failure.Message);
    }

    [Theory]
    [InlineData("/Dashboard")]
    [InlineData("/dashboard/")]
    [InlineData("~/Dashboard")]
    [InlineData("/")]
    [InlineData("https://accounts.example.com/home")]
    public async Task A_landing_path_that_names_a_non_guest_route_or_leaves_the_app_boots(string landingPath)
    {
        // "/" is guest in the template registry, so it is checked separately below.
        if (landingPath == "/")
        {
            Assert.NotNull(TestEnvironment.BootFailureFor(TemplateRegistry, landingPath));
            return;
        }

        using var factory = TestEnvironment.CreateServer(
            TemplateRegistry, startClient: true, landingPath: landingPath);

        var response = await factory.CreateClient().GetAsync("/Login");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_registry_without_guest_routes_never_redirects_to_the_landing_path_and_boots()
    {
        using var directory = TemporaryDirectory.Create("landing-no-guest");
        var registry = directory.WriteFile("routes.json", """
            [
              { "path": "/", "name": "Home", "access": "public",
                "files": { "react": "src/pages/Home/index.page.tsx", "view": "Views/Home/Index.cshtml" } }
            ]
            """);

        using var factory = TestEnvironment.CreateServer(
            registry, startClient: true, landingPath: "/Nowhere");

        var response = await factory.CreateClient().GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}

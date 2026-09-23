using System.Text.Json;
using Poyo.Framework;

namespace Poyo.Server.Tests;

/// <summary>
/// PageResult's result-construction surface over the fixture route: For()
/// builds a ViewResult for the registry view, explicit pageData overrides the
/// view harvest, and non-registry usage degrades to a plain view result.
/// </summary>
public class PageResultTests
{
    private static readonly RouteDefinition PublicRoute = new(
        "/Public",
        "Public",
        new RouteFiles("Views/Public/Index.cshtml"),
        RouteAccess.Public,
        new SeoModel("Public Title", null, null, null));

    [Fact]
    public void For_builds_view_result_for_the_registry_view()
    {
        var result = PageResult.For(new TestController(), viewPath: null, PublicRoute);

        Assert.Equal("Views/Public/Index.cshtml", result.ViewName);
    }

    [Fact]
    public void For_prefers_the_explicit_view_path()
    {
        var result = PageResult.For(
            new TestController(), viewPath: "Views/Other/Index.cshtml", PublicRoute);

        Assert.Equal("Views/Other/Index.cshtml", result.ViewName);
    }

    [Fact]
    public void For_without_view_path_outside_the_registry_falls_back_to_null()
    {
        var result = PageResult.For(new TestController(), viewPath: null, route: null);

        Assert.Null(result.ViewName);
    }

    [Fact]
    public void For_with_explicit_page_data_sets_the_document_payload()
    {
        var controller = new TestController();
        var json = JsonSerializer.Serialize(new { answer = 42 });

        var result = PageResult.For(controller, viewPath: null, PublicRoute, json);

        Assert.Equal(json, controller.ViewData["ServerData"]);
    }

    [Fact]
    public void For_without_explicit_page_data_leaves_view_data_untouched()
    {
        var controller = new TestController();

        PageResult.For(controller, viewPath: null, PublicRoute);

        Assert.False(controller.ViewData.ContainsKey("ServerData"));
    }

    [Fact]
    public void Navigation_header_contract_is_literal()
    {
        Assert.Equal("X-Poyo-Navigation", PageResult.NavigationHeaderName);
        Assert.Equal("1", PageResult.NavigationHeaderValue);
    }

    [Fact]
    public void RouteDefinition_defaults_dynamic_to_true()
    {
        Assert.True(PublicRoute.Dynamic);
    }

    [Fact]
    public void RouteDefinition_accepts_dynamic_false()
    {
        var route = new RouteDefinition(
            "/OptOut",
            "OptOut",
            new RouteFiles("Views/OptOut/Index.cshtml"),
            RouteAccess.Public,
            Dynamic: false);

        Assert.False(route.Dynamic);
    }

    private sealed class TestController : Microsoft.AspNetCore.Mvc.Controller
    {
    }
}

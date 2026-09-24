using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Poyo.Framework;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class ControllerExtensionsTests
{
    [Fact]
    public async Task PoyoPage_serializes_objects_with_camel_case_property_names()
    {
        var controller = CreateController();

        var result = controller.PoyoPage(new PageData("hello", 42));
        var pageData = (await ExecuteDescriptorAsync(result, controller)).GetProperty("pageData");

        Assert.Equal("hello", pageData.GetProperty("title").GetString());
        Assert.Equal(42, pageData.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task PoyoPage_preserves_property_names_from_json_strings()
    {
        var controller = CreateController();

        var result = controller.PoyoPage("{\"PreservedName\":true}");
        var pageData = (await ExecuteDescriptorAsync(result, controller)).GetProperty("pageData");

        Assert.True(pageData.GetProperty("PreservedName").GetBoolean());
    }

    [Fact]
    public void PoyoPage_accepts_absent_data()
    {
        var controller = CreateController();

        var result = controller.PoyoPage();

        Assert.NotNull(result);
    }

    [Theory]
    [InlineData("{")]
    [InlineData("not json")]
    public void PoyoPage_wraps_invalid_json_in_argument_exception(string json)
    {
        var controller = CreateController();

        var exception = Assert.Throws<ArgumentException>(() => controller.PoyoPage(json));

        Assert.IsAssignableFrom<JsonException>(exception.InnerException);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("42")]
    [InlineData("true")]
    [InlineData("\"text\"")]
    public void PoyoPage_rejects_non_object_json_strings(string json)
    {
        var controller = CreateController();

        Assert.Throws<ArgumentException>(() => controller.PoyoPage(json));
    }

    [Fact]
    public void PoyoPage_rejects_non_object_clr_values()
    {
        var controller = CreateController();

        Assert.Throws<ArgumentException>(() => controller.PoyoPage(42));
        Assert.Throws<ArgumentException>(() => controller.PoyoPage(true));
        Assert.Throws<ArgumentException>(() => controller.PoyoPage(new[] { 1, 2 }));
    }

    [Fact]
    public async Task PoyoPage_clones_caller_supplied_json_elements()
    {
        var controller = CreateController();

        PageResult result;
        using (var document = JsonDocument.Parse("{\"value\":42}"))
        {
            result = controller.PoyoPage(document.RootElement);
        }

        var pageData = (await ExecuteDescriptorAsync(result, controller)).GetProperty("pageData");

        Assert.Equal(42, pageData.GetProperty("value").GetInt32());
    }

    private static async Task<JsonElement> ExecuteDescriptorAsync(
        PageResult result,
        TestController controller)
    {
        controller.HttpContext.Request.Headers[PageResult.NavigationHeaderName] =
            PageResult.NavigationHeaderValue;
        using var body = new MemoryStream();
        controller.HttpContext.Response.Body = body;

        await result.ExecuteResultAsync(new ActionContext(
            controller.HttpContext,
            new RouteData(),
            new ActionDescriptor()));

        body.Position = 0;
        using var document = await JsonDocument.ParseAsync(body);
        return document.RootElement.Clone();
    }

    private static TestController CreateController()
    {
        var services = new ServiceCollection();
        services.AddControllersWithViews();
        services.AddSingleton(RoutePolicy.Load(TestEnvironment.FixturePath("routes.descriptor.json")));
        var serviceProvider = services.BuildServiceProvider();
        var httpContext = new DefaultHttpContext
        {
            RequestServices = serviceProvider,
        };
        httpContext.Request.Path = "/Custom";

        return new TestController
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = httpContext,
            },
        };
    }

    private sealed record PageData(string Title, int Count);

    private sealed class TestController : Controller
    {
    }
}

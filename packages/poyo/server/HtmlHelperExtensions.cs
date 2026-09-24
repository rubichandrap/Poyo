using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Poyo.Framework;

public static class HtmlHelperExtensions
{
    internal const string PageDataViewDataKey = "PoyoPageData";

    private static readonly JsonSerializerOptions PageDataJsonOptions = new()
    {
        Encoder = JavaScriptEncoder.Default,
    };

    public static IHtmlContent PoyoPageData(this IHtmlHelper htmlHelper)
    {
        var viewData = htmlHelper.ViewContext.ViewData;
        var services = htmlHelper.ViewContext.HttpContext.RequestServices;
        var environment = services.GetRequiredService<IHostEnvironment>();
        if (viewData.ContainsKey("ServerData")
            && environment.EnvironmentName == Environments.Development)
        {
            services.GetRequiredService<ILoggerFactory>()
                .CreateLogger("Poyo.Framework.HtmlHelperExtensions")
                .LogWarning(
                    "The legacy ViewData[\"ServerData\"] key is an unsupported Page data channel. Use PoyoPage(data) in the controller instead.");
        }

        if (viewData[PageDataViewDataKey] is not JsonElement pageData)
        {
            return HtmlString.Empty;
        }

        var json = JsonSerializer.Serialize(pageData, PageDataJsonOptions);
        return new HtmlString($"<script>window.SERVER_DATA = {json};</script>");
    }
}

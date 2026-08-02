using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public class PageController : Controller
{
    private readonly ILogger<PageController> _logger;

    public PageController(ILogger<PageController> logger)
    {
        _logger = logger;
    }

    [Authorize]
    public IActionResult Index(string viewPath, string pageName)
    {
        _logger.LogInformation("Serving protected page: {PageName}", pageName);
        ApplySeo(pageName);
        return View(viewPath);
    }

    [AllowAnonymous]
    public IActionResult PublicIndex(string viewPath, string pageName)
    {
        _logger.LogInformation("Serving public page: {PageName}", pageName);
        ApplySeo(pageName);
        return View(viewPath);
    }

    [AllowAnonymous]
    [Poyo.Server.Middleware.Auth.GuestOnly]
    public IActionResult GuestIndex(string viewPath, string pageName)
    {
        _logger.LogInformation("Serving guest-only page: {PageName}", pageName);
        ApplySeo(pageName);
        return View(viewPath);
    }

    private void ApplySeo(string pageName)
    {
        var seo = RouteData.Values["seo"] as Poyo.Server.Models.SeoModel;

        // Defaults
        ViewBag.Title = seo?.Title ?? pageName;
        ViewBag.Description = seo?.Description;
        ViewBag.MetaTags = seo?.Meta ?? new Dictionary<string, string>();
        ViewBag.JsonLd = seo?.JsonLd?.ToString();
    }
}


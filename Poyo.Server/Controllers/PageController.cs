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
        ViewBag.Title = pageName;
        return View(viewPath);
    }

    [AllowAnonymous]
    public IActionResult PublicIndex(string viewPath, string pageName)
    {
        _logger.LogInformation("Serving public page: {PageName}", pageName);
        ViewBag.Title = pageName;
        return View(viewPath);
    }
}


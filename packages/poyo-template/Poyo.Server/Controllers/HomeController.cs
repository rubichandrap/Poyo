using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public class HomeController(ILogger<HomeController> logger) : Controller
{
    private readonly ILogger<HomeController> _logger = logger;

    public IActionResult Index()
    {
        ViewBag.Title = "Welcome to Poyo";
        ViewBag.Description = "A modern React + .NET Core application with neubrutalism design and SEO-friendly server-side rendering";
        ViewBag.Keywords = "React, .NET Core, SEO, MPA, Neubrutalism, Server-side rendering, Modern web development";

        return View();
    }

    public IActionResult Error()
    {
        return View();
    }
}

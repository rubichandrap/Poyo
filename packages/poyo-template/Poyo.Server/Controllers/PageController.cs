using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public class PageController : Controller
{
    public IActionResult Index(string viewPath)
    {
        return View(viewPath);
    }
}

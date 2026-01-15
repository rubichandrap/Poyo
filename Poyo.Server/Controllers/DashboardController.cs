using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public class DashboardController : Controller
{
    [Authorize]
    public IActionResult Index()
    {
        return View();
    }
}

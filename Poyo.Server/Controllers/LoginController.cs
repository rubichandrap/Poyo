using Microsoft.AspNetCore.Mvc;
using Poyo.Server.Middleware.Auth;

namespace Poyo.Server.Controllers;

public class LoginController : Controller
{
    [GuestOnly]
    public IActionResult Index()
    {
        return View();
    }
}

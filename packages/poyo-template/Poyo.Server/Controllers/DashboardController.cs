using Microsoft.AspNetCore.Mvc;
using Poyo.Framework;

namespace Poyo.Server.Controllers;

public class DashboardController : Controller
{
    public IActionResult Index()
    {
        var dashboardData = new
        {
            message = "This data was injected from the server; semicolons are safe.",
            timestamp = DateTime.UtcNow.ToString("o"),
            user = User.Identity?.Name ?? "Unknown"
        };

        return this.PoyoPage(dashboardData);
    }
}

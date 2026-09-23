using Microsoft.AspNetCore.Mvc;
using Poyo.Framework;

namespace Poyo.Server.Tests.Support;

/// <summary>
/// A custom controller exercising the PoyoPage ergonomics for the /Custom
/// route in routes.descriptor.json. Discovered because the descriptor fixture
/// adds the test assembly as an MVC application part.
/// </summary>
public sealed class TestCustomController : Controller
{
    public IActionResult Page()
    {
        return this.PoyoPage(new
        {
            message = "hello from PoyoPage",
            answer = 42,
        });
    }
}

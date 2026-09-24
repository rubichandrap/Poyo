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

    public IActionResult StaticData()
    {
        return this.PoyoPage(new
        {
            message = "deterministic",
            answer = 42,
            note = "Saved; 3 items",
            markup = "</script><script>alert('xss')</script>",
            entities = "&amp; &lt; &gt; &#39; &quot;",
            special = "quotes: \" apostrophe: ' backslash: \\ slash: / newline:\n tab:\t",
            __proto__ = "safe",
        });
    }

    /// <summary>
    /// Passes a string that is not JSON: PoyoPage must refuse it instead of
    /// sending broken data to the client.
    /// </summary>
    public IActionResult BadData()
    {
        return this.PoyoPage("not json at all");
    }
}

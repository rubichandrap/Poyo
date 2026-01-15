using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Poyo.Server.Middleware.Auth;

/// <summary>
/// Injects server data into ViewBag.ServerData which gets rendered as window.SERVER_DATA
/// Usage: [ServerData(new { userId = 123, role = "admin" })]
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public class ServerDataAttribute : ActionFilterAttribute
{
    private readonly object? _data;

    public ServerDataAttribute(object? data = null)
    {
        _data = data;
    }

    public override void OnActionExecuting(ActionExecutingContext context)
    {
        // If data is provided via attribute, use it
        // Otherwise, controller can set ViewBag.ServerData manually
        if (_data != null && context.Controller is Microsoft.AspNetCore.Mvc.Controller controller)
        {
            controller.ViewBag.ServerData = JsonSerializer.Serialize(_data);
        }

        base.OnActionExecuting(context);
    }
}

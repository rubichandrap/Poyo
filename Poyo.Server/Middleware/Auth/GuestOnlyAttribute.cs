using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Poyo.Server.Middleware.Auth;

/// <summary>
/// Redirects authenticated users away from guest-only pages (like login/landing)
/// </summary>
public class GuestOnlyAttribute : ActionFilterAttribute
{
    public override void OnActionExecuting(ActionExecutingContext context)
    {
        if (context.HttpContext.User.Identity?.IsAuthenticated == true)
        {
            // Redirect authenticated users to dashboard
            context.Result = new RedirectResult("/Dashboard");
        }

        base.OnActionExecuting(context);
    }
}

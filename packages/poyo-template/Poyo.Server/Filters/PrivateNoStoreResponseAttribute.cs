using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Poyo.Server.Filters;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
internal sealed class PrivateNoStoreResponseAttribute : Attribute, IResourceFilter
{
    public PrivateNoStoreResponseAttribute()
    {
    }

    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        var response = context.HttpContext.Response;
        response.OnStarting(() =>
        {
            Apply(response.Headers);
            return Task.CompletedTask;
        });
        Apply(response.Headers);
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }

    private static void Apply(IHeaderDictionary headers)
    {
        headers.CacheControl = "private, no-store";
        headers.Remove("Pragma");
        headers.Remove("Expires");
    }
}

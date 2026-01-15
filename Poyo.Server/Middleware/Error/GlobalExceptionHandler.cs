using System.Net;
using Microsoft.AspNetCore.Diagnostics;

namespace Poyo.Server.Middleware.Error;

public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger = logger;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var request = httpContext.Request;
        var url = $"{request.Path}{request.QueryString}";

        // Log the error
        _logger.LogError(exception, "Unhandled exception occurred at {Url}", url);

        // PowerGIS format: { code = 400, data = "Message" }
        var response = new
        {
            code = (int)HttpStatusCode.InternalServerError,
            data = "An internal error occurred. Please contact support." // User friendly
        };

        // If it's a known domain exception, we might show the message
        // if (exception is DomainException) ...

        httpContext.Response.StatusCode = response.code;
        httpContext.Response.ContentType = "application/json";
        await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);

        return true;
    }
}


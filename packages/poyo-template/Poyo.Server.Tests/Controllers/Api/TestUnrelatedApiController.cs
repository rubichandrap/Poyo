using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Poyo.Server.Primitives;

namespace Poyo.Server.Tests.Controllers.Api;

[ApiController]
[Route("api/test-unrelated")]
public sealed class TestUnrelatedApiController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(JSendResponse<object>), StatusCodes.Status200OK)]
    public ActionResult<JSendResponse<object>> Get() =>
        Ok(JSend.Success<object>(new { status = "ok" }));
}

using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Poyo.Server.Models.Auth.Requests;
using Poyo.Server.Models.Auth.Responses;
using Poyo.Server.Primitives;
using Poyo.Server.Services.Auth;

namespace Poyo.Server.Controllers.Api;

[Route("api/[controller]")]
[ApiController]
public class AuthController(IAuthService authService) : ControllerBase
{
    private readonly IAuthService _authService = authService;

    [HttpPost("Login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(JSendResponse<LoginResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(JSendResponse<object>), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<JSendResponse<LoginResponse>>> Login([FromBody] LoginRequest request)
    {
        var response = await _authService.LoginAsync(request);

        if (response != null)
        {
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, response.Username)
            };

            var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var authProperties = new AuthenticationProperties
            {
                IsPersistent = true,
                ExpiresUtc = response.Expiration
            };

            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(claimsIdentity),
                authProperties);

            return Ok(JSend.Success(response));
        }

        return Unauthorized(JSend.Fail(new { message = "Invalid credentials." }));
    }

    [HttpPost("Refresh")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(JSendResponse<LoginResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(JSendResponse<object>), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<JSendResponse<LoginResponse>>> Refresh([FromBody] RefreshRequest request)
    {
        var response = await _authService.RefreshAsync(request);

        if (response != null)
        {
            // Update Auth Cookie (Claims)
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, response.Username)
            };

            var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var authProperties = new AuthenticationProperties
            {
                IsPersistent = true,
                ExpiresUtc = response.Expiration
            };

            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(claimsIdentity),
                authProperties);



            return Ok(JSend.Success(response));
        }

        return Unauthorized(JSend.Fail(new { message = "Invalid refresh token." }));
    }

    [HttpPost("Logout")]
    [ProducesResponseType(typeof(JSendResponse<LogoutResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<JSendResponse<LogoutResponse>>> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

        return Ok(JSend.Success(new LogoutResponse
        {
            Success = true,
            Message = "Logged out successfully"
        }));
    }
}


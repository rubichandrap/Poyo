using Poyo.Server.Models.Auth.Requests;
using Poyo.Server.Models.Auth.Responses;

namespace Poyo.Server.Services.Auth;

/// <summary>
/// Simple demo auth service - uses hardcoded credentials for demonstration
/// In production, replace with your own authentication logic (database, Identity, etc.)
/// </summary>
public class AuthService : IAuthService
{
    // Demo credentials - replace with real authentication
    private const string DemoUsername = "demo";
    private const string DemoPassword = "password";

    public Task<LoginResponse?> LoginAsync(LoginRequest request)
    {
        // Simple demo validation
        if (request.Username == DemoUsername && request.Password == DemoPassword)
        {
            return Task.FromResult<LoginResponse?>(new LoginResponse
            {
                Username = request.Username,
                Token = "demo-token", // In production, generate real JWT
                RefreshToken = "demo-refresh-token",
                Expiration = DateTime.UtcNow.AddHours(24)
            });
        }

        return Task.FromResult<LoginResponse?>(null);
    }

    public Task<LoginResponse?> RefreshAsync(RefreshRequest request)
    {
        // Simple demo refresh - just return new tokens
        // In production, validate the refresh token properly
        return Task.FromResult<LoginResponse?>(new LoginResponse
        {
            Username = "demo",
            Token = "demo-token-refreshed",
            RefreshToken = "demo-refresh-token-new",
            Expiration = DateTime.UtcNow.AddHours(24)
        });
    }
}

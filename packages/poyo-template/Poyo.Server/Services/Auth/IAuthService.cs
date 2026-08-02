using Poyo.Server.Models.Auth.Requests;
using Poyo.Server.Models.Auth.Responses;

namespace Poyo.Server.Services.Auth;

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request);
    Task<LoginResponse?> RefreshAsync(RefreshRequest request);
}

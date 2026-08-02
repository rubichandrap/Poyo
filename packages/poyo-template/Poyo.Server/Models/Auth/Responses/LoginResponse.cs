namespace Poyo.Server.Models.Auth.Responses;

public class LoginResponse
{
    public string Token { get; set; } = default!;

    public string RefreshToken { get; set; } = default!;

    public DateTime Expiration { get; set; }

    public string Username { get; set; } = default!;
}


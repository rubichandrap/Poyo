namespace Poyo.Server.Models.Auth.Requests;

public class RefreshRequest
{
    public string Token { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
}


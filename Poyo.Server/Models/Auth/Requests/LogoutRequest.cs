using System.ComponentModel.DataAnnotations;

namespace Poyo.Server.Models.Auth.Requests;

public class LogoutRequest
{
    [Required]
    public string AccessToken { get; set; } = default!;
}


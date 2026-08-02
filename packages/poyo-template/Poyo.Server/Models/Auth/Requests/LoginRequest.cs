using System.ComponentModel.DataAnnotations;

namespace Poyo.Server.Models.Auth.Requests;

public class LoginRequest
{
    [Required(ErrorMessage = "Username is required")]
    [StringLength(150, MinimumLength = 0, ErrorMessage = "Username must be between 0 and 150 characters")]
    public string Username { get; set; } = default!;

    [Required(ErrorMessage = "Password is required")]
    [StringLength(100, MinimumLength = 2, ErrorMessage = "Password must between 2 and 150 characters")]
    [DataType(DataType.Password)]
    public string Password { get; set; } = default!;

    public bool RememberMe { get; set; } = false;

    // "web" or "mobile"
    public string AppType { get; set; } = "web";
}


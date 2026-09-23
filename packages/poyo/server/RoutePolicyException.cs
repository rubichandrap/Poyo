namespace Poyo.Framework;

/// <summary>
/// Thrown when the routes registry violates the route schema. Escapes
/// startup, so a malformed registry fails the boot loudly instead of
/// misrouting every request.
/// </summary>
public class RoutePolicyException : Exception
{
    public RoutePolicyException(string message) : base(message)
    {
    }

    public RoutePolicyException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

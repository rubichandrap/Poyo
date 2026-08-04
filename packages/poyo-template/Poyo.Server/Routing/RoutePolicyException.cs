namespace Poyo.Server.Routing;

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

using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Server.Routing;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public class StartupFailureTests
{
    [Theory]
    [InlineData("routes.malformed.json", "malformed")]
    [InlineData("routes.unknown-field.json", "bogusField")]
    [InlineData("routes.wrong-type.json", "isPublic")]
    [InlineData("routes.duplicate.json", "duplicate")]
    public void Malformed_registry_fails_startup_loudly(string fixture, string messagePart)
    {
        var ex = Assert.ThrowsAny<Exception>(
            () => TestEnvironment.CreateServerAndStart(TestEnvironment.FixturePath(fixture)));

        var chain = Unwrap(ex);
        var routePolicyError = chain.OfType<RoutePolicyException>().FirstOrDefault();
        Assert.NotNull(routePolicyError);
        Assert.Contains(messagePart, routePolicyError.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static IEnumerable<Exception> Unwrap(Exception ex)
    {
        var current = ex;
        while (current is not null)
        {
            yield return current;
            current = current.InnerException;
        }
    }
}

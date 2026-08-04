using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public sealed class ServerFixture : IDisposable
{
    public ServerFixture()
    {
        Factory = TestEnvironment.CreateServerAndStart(TestEnvironment.TemplateRoutesPath());
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

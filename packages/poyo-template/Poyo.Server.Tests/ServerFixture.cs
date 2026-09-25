using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

public sealed class ServerFixture : IDisposable
{
    public ServerFixture()
    {
        Factory = TestEnvironment.CreateServer(
            TestEnvironment.TemplateRoutesPath(),
            startClient: true,
            configureBuilder: builder => builder.ConfigureServices(services =>
                services.AddControllersWithViews()
                    .PartManager.ApplicationParts.Add(
                        new AssemblyPart(typeof(ServerFixture).Assembly))));
    }

    public WebApplicationFactory<Program> Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
    }
}

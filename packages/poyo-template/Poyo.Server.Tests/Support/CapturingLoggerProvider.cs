using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Poyo.Server.Tests.Support;

/// <summary>
/// Collects the entries a host writes, so a test can prove two requests are
/// logged the same way. Registered as an extra <see cref="ILoggerProvider"/>
/// by the fixture that needs it.
/// </summary>
internal sealed class CapturingLoggerProvider : ILoggerProvider
{
    private readonly ConcurrentQueue<CapturedLog> _entries = new();

    internal IReadOnlyCollection<CapturedLog> Entries => _entries;

    public ILogger CreateLogger(string categoryName) =>
        new CapturingLogger(categoryName, _entries);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(
        string category,
        ConcurrentQueue<CapturedLog> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            entries.Enqueue(new CapturedLog(
                category,
                logLevel,
                formatter(state, exception),
                exception));
        }
    }
}

internal sealed record CapturedLog(
    string Category,
    LogLevel Level,
    string Message,
    Exception? Exception);

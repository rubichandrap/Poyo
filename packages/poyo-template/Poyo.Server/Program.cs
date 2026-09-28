using DotNetEnv;
using Microsoft.OpenApi;
using Poyo.Framework;
using Vite.AspNetCore;

// The process environment owns the hosting environment (ADR 0015). It is read
// from the process before anything else loads, so the environment file can
// never decide the environment it is conditional on. A host names the
// environment with either variable, and DOTNET_ENVIRONMENT wins in the
// framework's own configuration, so read them the way the framework reads
// them — otherwise a host using the general name would still be at the mercy
// of the file.
string? dotnetEnvironment = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
string? aspnetEnvironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
string? hostingEnvironment = dotnetEnvironment ?? aspnetEnvironment;

// The environment file is a development convenience, never a deployment
// requirement: the launcher names it, a missing file is not a failure, and it
// is read only when the process says development or says nothing. The loader
// defaults to overriding what is already set, so filling gaps is stated here
// rather than inherited — a real deployment variable always wins.
string? envFile = Environment.GetEnvironmentVariable("EnvFile");

if (IsUnsetOrDevelopment(hostingEnvironment)
    && !string.IsNullOrWhiteSpace(envFile)
    && File.Exists(envFile))
{
    Env.Load(envFile, LoadOptions.NoClobber());

    // Filling gaps covers the hosting environment when the process left it
    // out, so put back the absence of every name the process did not use. The
    // file cannot contribute the environment, by either name or by omission.
    if (dotnetEnvironment is null)
    {
        Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", null);
    }

    if (aspnetEnvironment is null)
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", null);
    }
}

static bool IsUnsetOrDevelopment(string? hostingEnvironment) =>
    string.IsNullOrWhiteSpace(hostingEnvironment)
    || string.Equals(hostingEnvironment, Environments.Development, StringComparison.OrdinalIgnoreCase);

static void RequireEnv(params string[] keys)
{
    var missing = keys
        .Where(k => string.IsNullOrWhiteSpace(
            Environment.GetEnvironmentVariable(k)))
        .ToList();

    if (missing.Count > 0)
    {
        throw new InvalidOperationException(
            "Missing required environment variables:\n" +
            string.Join("\n", missing.Select(k => $" - {k}"))
        );
    }
}

WebApplicationBuilder? builder = WebApplication.CreateBuilder(args);

// The Vite integration is a development tool, so its requirements are
// development requirements. Outside development a host owns no client dev
// server, and the allowed-hosts value ships in appsettings.json, so a
// production host needs nothing this template owns. An unset hosting
// environment is production, the framework's own default and the safe
// direction; loud failure stays where no safe default exists, which is here.
if (builder.Environment.IsDevelopment())
{
    RequireEnv(
        "Vite__Server__AutoRun",
        "Vite__Server__Port",
        "Vite__Server__DevServerUrl");

    if (!int.TryParse(
            Environment.GetEnvironmentVariable("Vite__Server__Port"),
            out _))
    {
        throw new InvalidOperationException(
            "Vite__Server__Port must be a valid integer");
    }
}

// Route policy + universal access/SEO enforcement (the server core ships
// inside @rubichandrap/poyo and compiles in place — ADR 0008). The registry
// is a required deployment artifact: it travels beside the application, and
// Routes:JsonPath overrides its location for hosted runs. The content root
// resolves a relative Routes:JsonPath, and the working directory is never
// consulted.
builder.Services.AddPoyo(
    builder.Configuration,
    contentRootPath: builder.Environment.ContentRootPath);

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi(options =>
{
    options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_0;
});

if (builder.Environment.IsDevelopment() || builder.Environment.IsStaging())
{
    builder.Services.AddHostedService<Poyo.Server.Hosting.OpenApiSnapshotExportHostedService>();
}

// Add authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = "Cookies"; // Default to cookies for normal web
})
    .AddCookie("Cookies", options =>
    {
        // Required for cross-origin (Vite -> API) on localhost
        options.Cookie.SameSite = SameSiteMode.None;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;

        options.LoginPath = "/Login";
        options.LogoutPath = "/";
        options.AccessDeniedPath = "/";

        // Override default redirect behavior for API calls
        options.Events.OnRedirectToLogin = context =>
        {
            PathString path = context.Request.Path;
            if (path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });

// Add authorization
builder.Services.AddAuthorization();

// Add Application Services
builder.Services.AddScoped<Poyo.Server.Services.Auth.IAuthService, Poyo.Server.Services.Auth.AuthService>();

// Exception Handling
builder.Services.AddExceptionHandler<
    Poyo.Server.Middleware.Error.GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowClient", policy =>
    {
        policy.WithOrigins("https://localhost:7058", "http://localhost:5173", "http://localhost:4173") // Vite/Aspire ports
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Add Vite services
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddViteServices(options =>
    {
        // Bind configuration from .env
        builder.Configuration.GetSection("Vite").Bind(options);

        // Safe defaults
        options.Server.AutoRun = true;
        options.Server.Https = false;
    });
}

WebApplication app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseViteDevelopmentServer(true);
}

// Use Global Exception Handler
app.UseExceptionHandler();

// Only use HTTPS redirection in production
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("AllowClient");

app.UseAuthentication();
app.UseAuthorization();

// API routes
app.MapControllers();

// Dynamic Routing from routes.json
app.MapPoyoRoutes();

// MPA routes (Fallback for unmatched URLs, clean 404)
app.MapControllerRoute(
    name: "default",
    pattern: "{controller}/{action}/{id?}");

app.Run();

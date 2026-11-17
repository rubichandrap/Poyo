using Microsoft.OpenApi;
using Poyo.Framework;
using Vite.AspNetCore;

// The framework owns the host bootstrap (ADR 0021): the hosting environment is
// read from the process before anything else loads (ADR 0017), the environment
// file is a development convenience, and the content root follows the
// application's content rather than the host's working directory (ADR 0014
// amendment).
WebApplicationBuilder builder = PoyoHost.CreateBuilder(args);

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

// The Vite integration is a development tool, so its requirements are
// development requirements. Outside development a host owns no client dev
// server, and the allowed-hosts value ships in appsettings.json, so a
// production host needs nothing this template owns. Loud failure stays where no
// safe default exists, which is the development variables.
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
// resolves a relative Routes:JsonPath — which inherits the working directory
// when the host does not set a content root, so prefer an absolute one.
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

// A deployment may mount the app under a path base (an IIS virtual directory,
// a reverse-proxy prefix). The framework applies the configured PathBase once,
// here, before static files and routing; every URL the app emits — asset tags
// through Url.Content, navigation, API calls, redirects — resolves against the
// same Request.PathBase, so nothing has to guess it (ADR 0021).
app.UsePoyoPathBase();

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

// Dynamic Routing from routes.json — the registry is the single source of
// truth for route existence. There is deliberately no conventional
// controller/action fallback: a URL the registry does not own matches no
// endpoint and is answered by routing with a clean 404, so a page has exactly
// one URL and every URL that reaches a page carries the same access, SEO and
// private no-store policy.
app.MapPoyoRoutes();

app.Run();

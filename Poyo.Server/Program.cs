using DotNetEnv;
using Microsoft.OpenApi;
using Vite.AspNetCore;

var root = Directory.GetParent(Directory.GetCurrentDirectory())!.FullName;
var envPath = Path.Combine(root, ".env");

Env.Load(envPath);

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

if (!int.TryParse(
        Environment.GetEnvironmentVariable("Vite__Server__Port"),
        out _))
{
    throw new InvalidOperationException(
        "Vite__Server__Port must be a valid integer");
}

var builder = WebApplication.CreateBuilder(args);

RequireEnv(
    "ASPNETCORE_ENVIRONMENT",
    "AllowedHosts",
    "Vite__Server__AutoRun",
    "Vite__Server__Port"
);

if (builder.Environment.IsDevelopment())
{
    RequireEnv("Vite__Server__DevServerUrl");
}

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi(options =>
{
    options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_0;
});

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
        options.LogoutPath = "/Home";
        options.AccessDeniedPath = "/Home";

        // Override default redirect behavior for API calls
        options.Events.OnRedirectToLogin = context =>
        {
            var path = context.Request.Path;
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

var app = builder.Build();

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
try
{
    var routesJsonPath = Path.Combine(root, "routes.json");
    if (File.Exists(routesJsonPath))
    {
        var routesJson = File.ReadAllText(routesJsonPath);
        var routes = System.Text.Json.JsonSerializer.Deserialize<List<RouteDefinition>>(routesJson, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (routes != null)
        {
            foreach (var route in routes)
            {
                if (route.Name.Equals("Home", StringComparison.OrdinalIgnoreCase)) continue;

                var controllerName = !string.IsNullOrWhiteSpace(route.Controller) ? route.Controller : "Page";
                var actionName = !string.IsNullOrWhiteSpace(route.Action)
                    ? route.Action
                    : (route.IsGuestOnly ? "GuestIndex" : (route.IsPublic ? "PublicIndex" : "Index"));

                // Map route
                app.MapControllerRoute(
                    name: route.Name,
                    pattern: route.Path.TrimStart('/'),
                    defaults: new
                    {
                        controller = controllerName,
                        action = actionName,
                        viewPath = route.Files.View,
                        pageName = route.Name,
                        seo = route.Seo
                    });
            }
        }
    }
}
catch (Exception ex)
{
    Console.WriteLine($"Error loading routes.json: {ex.Message}");
}

// MPA routes (Fallback for Home and others)
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();

// Helper record for deserialization
internal record RouteDefinition(string Path, string Name, RouteFiles Files, bool IsPublic, bool IsGuestOnly, Poyo.Server.Models.SeoModel? Seo, string? Controller, string? Action);
internal record RouteFiles(string View);





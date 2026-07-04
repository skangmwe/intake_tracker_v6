// AI Solutions Tracker — API entrypoint.
//
// Scaffold state: this Program.cs wires the minimum ASP.NET Core pipeline
// required to serve GET /health end-to-end. Feature slices layer additional
// middleware, controllers, DI registrations, and configuration on top of this
// skeleton. Middleware order below follows api-performance.md verbatim; do not
// re-order without updating the doc first.
//
// The health endpoint is deliberately anonymous and does NOT hit the database
// or any downstream service (api/CLAUDE.md — "no dependencies and no database
// calls — it must always respond, even if downstream services are degraded").

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Users;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Errors;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Logging;
using McDermott.AiTracker.Api.Shared.Messaging;
using McDermott.AiTracker.Api.Shared.Middleware;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.EntityFrameworkCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Serilog — Console always, Application Insights when configured (api-logging.md).
builder.ConfigureSerilog();

// ─── Services ────────────────────────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        // Enum-as-string on the wire (api-coding-standards.md JSON Serialization rule).
        opts.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

// ProblemDetails + the single global exception handler (api-error-handling.md).
// GlobalExceptionHandler maps unhandled exceptions to 500 RFC 7807 without ever exposing
// a stack trace or exception message, in every environment.
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// ─── Auth (api-auth.md) ────────────────────────────────────────────────────
// Entra ID JWT-bearer validation, or the dev bypass when Auth:DevBypass:Enabled is set.
// Registers ICurrentUser + the fallback "must be authenticated" authorization policy.
builder.AddAppAuthentication();
builder.AddSpaCors();

// ─── Data access (EF Core, single-table CRUD — api-data-access.md) ─────────
// Registration is lazy; no connection is opened at startup, so GET /health (which
// touches no database) always responds. The connection string is non-secret for
// local dev (LocalDB, Windows auth); production overrides it with an AAD /
// Managed-Identity connection string via configuration (api-secrets.md).
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("AppDb")));

// ─── Options (non-secret config — api-secrets.md) ──────────────────────────
builder.Services.Configure<ServiceBusOptions>(
    builder.Configuration.GetSection(ServiceBusOptions.SectionName));

// ─── Shared services (shared-inventory.md) ─────────────────────────────────
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddSingleton<IServiceBusPublisher, ServiceBusPublisher>();
builder.Services.AddScoped<IAuditWriter, AuditWriter>();
builder.Services.AddScoped<IEventSpine, EventSpine>();

// ─── Module services (Users — slice 2) ─────────────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Shared.Auth.IUserProvisioner,
    McDermott.AiTracker.Api.Shared.Auth.UserProvisioner>();
builder.Services.AddScoped<IUserProfileService, UserProfileService>();

// ─── Fields & objects (slice 3) ─────────────────────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Shared.Auth.IAccessGuard,
    McDermott.AiTracker.Api.Shared.Auth.AccessGuard>();
builder.Services.AddSingleton<McDermott.AiTracker.Api.Shared.Rules.IConditionEngine,
    McDermott.AiTracker.Api.Shared.Rules.ConditionEngine>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Fields.IFieldSchemaService,
    McDermott.AiTracker.Api.Modules.Fields.FieldSchemaService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.PlatformAdmin.IPlatformFieldService,
    McDermott.AiTracker.Api.Modules.PlatformAdmin.PlatformFieldService>();

// Swagger is deferred to a later slice that adds Swashbuckle with the pinned
// Microsoft.OpenApi override. Config flag remains so early consumers see the
// intended contract (api-coding-standards.md — Swagger is gated by config, not
// the environment).

var app = builder.Build();

// ─── Middleware pipeline (order per api-performance.md) ────────────────
// 1. Exception handling — wraps the whole pipeline; uses GlobalExceptionHandler.
app.UseExceptionHandler();

// 2. HTTPS redirection — skipped locally; enabled at deployment.

// 3. CORS — env-driven allowed origins (api/CLAUDE.md).
app.UseCors(AuthenticationSetup.CorsPolicyName);

// 4. OperationId middleware (before any logging — api-logging.md).
app.UseMiddleware<OperationIdMiddleware>();

// 5. AFD lockdown (before UseAuthentication so unauth callers that bypassed
//    AFD do not reach token validation — api-auth.md).
app.UseMiddleware<AfdLockdownMiddleware>();

// 6. Security headers + Cache-Control defaults — placed before authentication so their
//    OnStarting callbacks cover short-circuited 401/403 responses too (same rationale as
//    OperationId running before auth). api-performance.md (Security Headers),
//    api-coding-standards.md (Response Caching / AFD lockdown).
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<CacheControlMiddleware>();

// 7. Authentication — Entra JWT bearer, or the dev bypass (api-auth.md).
app.UseAuthentication();

// 8. Authorization — the fallback policy requires an authenticated user everywhere
//    except [AllowAnonymous] endpoints (GET /health).
app.UseAuthorization();

// 9. EnsureUser middleware — after UseAuthorization, before MapControllers. Provisions the
//    caller's row on first authenticated request (api-auth.md).
app.UseMiddleware<EnsureUserMiddleware>();

// Request-completion logging — after OperationId so each entry carries the OperationId
// from LogContext (api-logging.md). Logs method/path/status/duration only — never a body.
app.UseSerilogRequestLogging();

// 10. Endpoints
app.MapControllers();

app.Run();

// Test entry point — allows WebApplicationFactory<Program> in integration tests.
public partial class Program { }

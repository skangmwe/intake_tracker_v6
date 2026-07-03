// Serilog configuration (api-logging.md). Console sink is always on (container stdout
// + local dev); the Application Insights sink is added only when
// APPLICATIONINSIGHTS_CONNECTION_STRING is set (never the legacy instrumentation key).
// Enrich.FromLogContext surfaces the structured UserId (Entra oid) + OperationId that
// the OperationId / EnsureUser middleware push to LogContext — the two properties
// required on every entry.
//
// PII: this configuration never logs request/response bodies. Serilog destructuring
// policies that redact PII-bearing DTOs (api-pii-handling.md) are added by the slices
// that introduce those DTOs — none exist yet in the foundation slice.

using Microsoft.ApplicationInsights.Extensibility;
using Serilog;
using Serilog.Events;

namespace McDermott.AiTracker.Api.Shared.Logging;

public static class SerilogConfig
{
    public static void ConfigureSerilog(this WebApplicationBuilder builder)
    {
        builder.Host.UseSerilog((context, loggerConfiguration) =>
        {
            loggerConfiguration
                .ReadFrom.Configuration(context.Configuration)
                .MinimumLevel.Information()
                .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
                .Enrich.FromLogContext()
                .WriteTo.Console();

            var appInsightsConnection = context.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"];
            if (!string.IsNullOrWhiteSpace(appInsightsConnection))
            {
                var telemetryConfiguration = TelemetryConfiguration.CreateDefault();
                telemetryConfiguration.ConnectionString = appInsightsConnection;
                loggerConfiguration.WriteTo.ApplicationInsights(telemetryConfiguration, TelemetryConverter.Traces);
            }
        });
    }
}

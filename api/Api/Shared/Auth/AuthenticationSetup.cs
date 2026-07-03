// Wires authentication + authorization for the API. Two mutually-exclusive paths:
//
//   * Real path (default): Entra ID JWT-bearer validation via Microsoft.Identity.Web,
//     bound from the non-secret "AzureAd" config section (TenantId, ClientId, Audience —
//     api-auth.md / api-secrets.md). Tokens are validated; no custom JWT parsing.
//   * Dev bypass (Auth:DevBypass:Enabled = true, dev only): a fixed local identity so the
//     app runs without a live tenant (dev-local-testing skill).
//
// A fallback authorization policy requires an authenticated user on every endpoint; only
// endpoints marked [AllowAnonymous] (GET /health) are exempt (api-auth.md — "[Authorize]
// on all controllers, only GET /health is anonymous").

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Identity.Web;

namespace McDermott.AiTracker.Api.Shared.Auth;

public static class AuthenticationSetup
{
    public const string CorsPolicyName = "SpaCors";

    /// <summary>Registers authentication (real Entra or dev bypass) + the fallback authorization policy.</summary>
    public static IServiceCollection AddAppAuthentication(this WebApplicationBuilder builder)
    {
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUser, CurrentUser>();

        var authSection = builder.Configuration.GetSection("Auth");
        var devBypassEnabled = authSection.GetValue<bool>("DevBypass:Enabled");

        if (devBypassEnabled)
        {
            builder.Services
                .AddAuthentication(DevBypassAuthHandler.SchemeName)
                .AddScheme<DevBypassSchemeOptions, DevBypassAuthHandler>(
                    DevBypassAuthHandler.SchemeName,
                    options =>
                    {
                        var devSection = authSection.GetSection("DevBypass");
                        var userId = devSection["UserId"];
                        if (!string.IsNullOrWhiteSpace(userId))
                        {
                            options.UserId = userId;
                        }

                        var displayName = devSection["DisplayName"];
                        if (!string.IsNullOrWhiteSpace(displayName))
                        {
                            options.DisplayName = displayName;
                        }

                        var email = devSection["Email"];
                        if (!string.IsNullOrWhiteSpace(email))
                        {
                            options.Email = email;
                        }
                    });
        }
        else
        {
            builder.Services
                .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));
        }

        builder.Services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build());

        return builder.Services;
    }

    /// <summary>CORS for the SPA. Allowed origins come from env-driven config, never hardcoded (api/CLAUDE.md).</summary>
    public static IServiceCollection AddSpaCors(this WebApplicationBuilder builder)
    {
        var allowedOrigins = builder.Configuration
            .GetSection("Api:AllowedOrigins")
            .Get<string[]>() ?? Array.Empty<string>();

        builder.Services.AddCors(options =>
        {
            options.AddPolicy(CorsPolicyName, policy =>
            {
                if (allowedOrigins.Length > 0)
                {
                    policy.WithOrigins(allowedOrigins)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .WithExposedHeaders(Middleware.OperationIdMiddleware.HeaderName);
                }
            });
        });

        return builder.Services;
    }
}

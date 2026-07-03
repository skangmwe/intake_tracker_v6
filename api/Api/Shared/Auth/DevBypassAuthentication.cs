// Development-only authentication bypass. Lets the SPA + API run locally (dotnet run)
// without a live Entra tenant, per the dev-local-testing skill. It is gated behind the
// `Auth:DevBypass:Enabled` config flag, which is OFF by default and must NEVER be true in
// a deployed environment — the fixed identity below is non-secret placeholder config
// (api-secrets.md: endpoints and flags are non-secret; there is no secret here).
//
// When disabled, the pipeline uses real Microsoft.Identity.Web JWT-bearer validation
// (see AuthenticationSetup). The claims minted here mirror a v2.0 token (`oid`, `name`,
// `preferred_username`) so CurrentUser resolves identically on both paths.

using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Shared.Auth;

/// <summary>Options for the dev bypass scheme — the fixed local identity to sign in as.</summary>
public sealed class DevBypassSchemeOptions : AuthenticationSchemeOptions
{
    /// <summary>The Entra `oid` this bypass mints. Any GUID; used as the local user's id.</summary>
    public string UserId { get; set; } = "00000000-0000-0000-0000-000000000001";

    public string DisplayName { get; set; } = "Local Developer";

    public string Email { get; set; } = "dev@localhost";
}

/// <summary>Signs every request in as the configured local developer. Dev only.</summary>
public sealed class DevBypassAuthHandler : AuthenticationHandler<DevBypassSchemeOptions>
{
    public const string SchemeName = "DevBypass";

    public DevBypassAuthHandler(
        IOptionsMonitor<DevBypassSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim("oid", Options.UserId),
            new Claim("name", Options.DisplayName),
            new Claim("preferred_username", Options.Email),
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

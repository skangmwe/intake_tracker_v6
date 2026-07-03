// Resolves the authenticated caller's stable identity from the validated JWT claims.
// The Entra `oid` claim is the only user identifier permitted in logs (api-logging.md);
// DisplayName / Email are PII read from the token for provisioning and are never logged.
//
// Handles both v2.0 access tokens (short claim names: `oid`, `name`,
// `preferred_username`) and v1.0 tokens (long claim-type URIs) per api-client-auth.md.

using System.Security.Claims;

namespace McDermott.AiTracker.Api.Shared.Auth;

/// <summary>The authenticated caller for the current request.</summary>
public interface ICurrentUser
{
    /// <summary>True when the request carries a validated identity.</summary>
    bool IsAuthenticated { get; }

    /// <summary>The Entra `oid` claim (GUID). Throws if the request is unauthenticated.</summary>
    Guid UserId { get; }

    /// <summary>Display name from the token (PII — never logged). Empty when absent.</summary>
    string DisplayName { get; }

    /// <summary>Email / preferred_username from the token (PII — never logged). Empty when absent.</summary>
    string Email { get; }

    /// <summary>Non-throwing accessor — null when the request is unauthenticated.</summary>
    Guid? TryGetUserId();
}

public sealed class CurrentUser : ICurrentUser
{
    // v2.0 short names first, then v1.0 long claim-type URIs.
    private static readonly string[] ObjectIdClaims =
    {
        "oid",
        "http://schemas.microsoft.com/identity/claims/objectidentifier",
    };

    private static readonly string[] NameClaims =
    {
        "name",
        ClaimTypes.Name,
    };

    private static readonly string[] EmailClaims =
    {
        "preferred_username",
        "email",
        ClaimTypes.Email,
        ClaimTypes.Upn,
    };

    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUser(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    private ClaimsPrincipal? Principal => _httpContextAccessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public Guid UserId =>
        TryGetUserId()
        ?? throw new InvalidOperationException("No authenticated user on the current request.");

    public string DisplayName => FirstClaim(NameClaims) ?? string.Empty;

    public string Email => FirstClaim(EmailClaims) ?? string.Empty;

    public Guid? TryGetUserId()
    {
        var raw = FirstClaim(ObjectIdClaims);
        return Guid.TryParse(raw, out var parsed) ? parsed : null;
    }

    private string? FirstClaim(string[] claimTypes)
    {
        var principal = Principal;
        if (principal is null)
        {
            return null;
        }

        foreach (var claimType in claimTypes)
        {
            var value = principal.FindFirstValue(claimType);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }
}

// Provisions the caller's dbo.Users row on their first authenticated request per replica
// (api-auth.md — "New caller registration is an API concern"). Clients never call a
// /register endpoint.
//
//   * Runs after UseAuthorization and before MapControllers, so the caller is
//     authenticated + authorized and the row exists before the controller runs.
//   * A per-replica ConcurrentDictionary cache keys on the Entra `oid` so provisioning
//     happens at most once per replica per user.
//   * Best-effort: a failed upsert logs at Warning and the request continues — the next
//     request retries. Only `oid` (pseudonymous) is logged; DisplayName / Email are PII
//     and are never logged (api-logging.md / api-pii-handling.md).

using System.Collections.Concurrent;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Time;
using Serilog.Context;

namespace McDermott.AiTracker.Api.Shared.Middleware;

public sealed class EnsureUserMiddleware
{
    // Instance field on the singleton middleware — one cache per replica.
    private readonly ConcurrentDictionary<Guid, byte> _provisioned = new();
    private readonly RequestDelegate _next;

    public EnsureUserMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(
        HttpContext context,
        ICurrentUser currentUser,
        IUserProvisioner provisioner,
        IClock clock,
        ILogger<EnsureUserMiddleware> logger)
    {
        if (!currentUser.IsAuthenticated)
        {
            await _next(context);
            return;
        }

        var userId = currentUser.TryGetUserId();
        if (userId is null)
        {
            await _next(context);
            return;
        }

        // UserId (pseudonymous Entra oid) is the second required structured log property
        // (api-logging.md). Push it for every authenticated request — not just first-provision —
        // so all downstream entries, including the request-completion log, carry it.
        using (LogContext.PushProperty("UserId", userId.Value))
        {
            if (!_provisioned.ContainsKey(userId.Value))
            {
                try
                {
                    await provisioner.ProvisionAsync(
                        userId.Value,
                        currentUser.DisplayName,
                        currentUser.Email,
                        clock.UtcNow,
                        context.RequestAborted);

                    _provisioned.TryAdd(userId.Value, 0);
                }
                catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
                {
                    // Client disconnected mid-provision — do not cache, let the next request retry.
                    throw;
                }
                catch (Exception ex)
                {
                    // Best-effort provisioning (api-auth.md). Log the pseudonymous id only.
                    logger.LogWarning(ex, "User provisioning failed for {UserId}; continuing.", userId.Value);
                }
            }

            await _next(context);
        }
    }
}

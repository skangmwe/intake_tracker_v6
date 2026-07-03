// The seam that keeps EnsureUserMiddleware unit-testable (mirrors the AuditWriter pattern):
// the middleware owns the per-replica cache + best-effort policy; this thin wrapper owns the
// single database call. Idempotent upsert via usp_UpsertUser, parameterised (api-data-access.md).

using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Shared.Auth;

public interface IUserProvisioner
{
    Task ProvisionAsync(
        Guid userId,
        string displayName,
        string email,
        DateTimeOffset signInAt,
        CancellationToken cancellationToken);
}

public sealed class UserProvisioner : IUserProvisioner
{
    private readonly AppDbContext _db;

    public UserProvisioner(AppDbContext db) => _db = db;

    public Task ProvisionAsync(
        Guid userId,
        string displayName,
        string email,
        DateTimeOffset signInAt,
        CancellationToken cancellationToken)
    {
        return _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpsertUser @UserId, @DisplayName, @Email, @SignInAt",
            new[]
            {
                new SqlParameter("@UserId", userId),
                new SqlParameter("@DisplayName", displayName),
                new SqlParameter("@Email", email),
                new SqlParameter("@SignInAt", signInAt.UtcDateTime),
            },
            cancellationToken);
    }
}

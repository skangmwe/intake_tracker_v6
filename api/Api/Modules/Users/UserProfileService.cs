// Builds the caller's profile (GET /users/me) and persists their theme preference.
// The membership+workspace join is read through usp_GetUserWorkspaces (api-data-access.md —
// joins go through stored procedures); the user row, platform-admin grant, and theme update
// are single-table EF operations.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Users;

public interface IUserProfileService
{
    /// <summary>Assembles the caller's profile, or null when no user row exists yet.</summary>
    Task<MeDto?> GetMeAsync(Guid userId, CancellationToken cancellationToken);

    /// <summary>Persists the caller's theme. False when no user row exists.</summary>
    Task<bool> UpdateThemeAsync(Guid userId, string theme, CancellationToken cancellationToken);
}

public sealed class UserProfileService : IUserProfileService
{
    private readonly AppDbContext _db;
    private readonly IClock _clock;

    public UserProfileService(AppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<MeDto?> GetMeAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.UserId == userId, cancellationToken)
            .ConfigureAwait(false);

        if (user is null)
        {
            return null;
        }

        var isPlatformAdmin = await _db.PlatformAdminGrants
            .AsNoTracking()
            .AnyAsync(grant => grant.UserId == userId, cancellationToken)
            .ConfigureAwait(false);

        var rows = await _db.Set<UserWorkspaceRow>()
            .FromSqlRaw("EXEC dbo.usp_GetUserWorkspaces @UserId", new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var memberships = rows
            .Select(row => new WorkspaceMembershipDto(
                row.WorkspaceId,
                row.WorkspaceName,
                row.WorkspaceKind,
                row.WorkspacePrefix,
                row.Level,
                row.IsDashboardViewer,
                row.BoundDashboardId))
            .ToList();

        var boundDashboardId = rows
            .FirstOrDefault(row => row.IsDashboardViewer && row.BoundDashboardId.HasValue)
            ?.BoundDashboardId;

        var userDto = new UserDto(
            user.UserId,
            user.DisplayName,
            user.Email,
            // Stored UTC (SYSUTCDATETIME) — stamp the kind so it serializes with a 'Z' suffix.
            DateTime.SpecifyKind(user.LastSignInAt, DateTimeKind.Utc),
            user.IsDisabled,
            user.Theme);

        return new MeDto(userDto, memberships, isPlatformAdmin, boundDashboardId);
    }

    public async Task<bool> UpdateThemeAsync(Guid userId, string theme, CancellationToken cancellationToken)
    {
        var user = await _db.Users
            .FirstOrDefaultAsync(candidate => candidate.UserId == userId, cancellationToken)
            .ConfigureAwait(false);

        if (user is null)
        {
            return false;
        }

        user.Theme = theme;
        user.UpdatedAt = _clock.UtcNow.UtcDateTime;
        user.UpdatedBy = userId.ToString();

        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return true;
    }
}

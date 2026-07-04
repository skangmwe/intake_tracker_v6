// Access guard — the single authoritative server-side access check (api-record-access.md).
// Reads the caller's per-workspace level and the additive Platform-admin grant from SQL via
// single-table EF (no join → stays in EF CRUD per api-data-access.md). Returns booleans rather
// than throwing: a 403 is expected control flow, not an exceptional condition
// (api-coding-standards.md — no exceptions for expected control flow). Controllers translate a
// false result into 403 (never 404) per api-error-handling.md.

using McDermott.AiTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Shared.Auth;

/// <summary>Per-workspace access level, ordered Viewer &lt; Member &lt; WorkspaceAdmin.</summary>
public enum WorkspaceLevel
{
    Viewer = 0,
    Member = 1,
    WorkspaceAdmin = 2,
}

public interface IAccessGuard
{
    /// <summary>True when the caller holds at least <paramref name="minimumLevel"/> in the workspace.</summary>
    Task<bool> HasWorkspaceLevelAsync(Guid userId, Guid workspaceId, WorkspaceLevel minimumLevel, CancellationToken cancellationToken);

    /// <summary>True when the caller carries the additive firm-wide Platform-admin grant (BS §4.3).</summary>
    Task<bool> IsPlatformAdminAsync(Guid userId, CancellationToken cancellationToken);
}

public sealed class AccessGuard : IAccessGuard
{
    private readonly AppDbContext _db;

    public AccessGuard(AppDbContext db)
    {
        _db = db;
    }

    public async Task<bool> HasWorkspaceLevelAsync(
        Guid userId,
        Guid workspaceId,
        WorkspaceLevel minimumLevel,
        CancellationToken cancellationToken)
    {
        var level = await _db.WorkspaceMemberships
            .AsNoTracking()
            .Where(membership => membership.UserId == userId && membership.WorkspaceId == workspaceId)
            .Select(membership => membership.Level)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return TryParseLevel(level, out var actualLevel) && actualLevel >= minimumLevel;
    }

    public Task<bool> IsPlatformAdminAsync(Guid userId, CancellationToken cancellationToken) =>
        _db.PlatformAdminGrants
            .AsNoTracking()
            .AnyAsync(grant => grant.UserId == userId, cancellationToken);

    private static bool TryParseLevel(string? stored, out WorkspaceLevel level)
    {
        switch (stored)
        {
            case "Viewer":
                level = WorkspaceLevel.Viewer;
                return true;
            case "Member":
                level = WorkspaceLevel.Member;
                return true;
            case "WorkspaceAdmin":
                level = WorkspaceLevel.WorkspaceAdmin;
                return true;
            default:
                level = WorkspaceLevel.Viewer;
                return false;
        }
    }
}

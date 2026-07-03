// EF Core DbContext for the foundation schema. Single-table CRUD only
// (api-data-access.md) — joins, aggregations, and business logic go through stored
// procedures. Table/key mappings mirror the hand-written SQL migrations; the
// migrations remain the single source of truth for column types and indexes.

using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Data;

public sealed class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<User> Users => Set<User>();
    public DbSet<WorkspaceMembership> WorkspaceMemberships => Set<WorkspaceMembership>();
    public DbSet<PrefixRegistry> PrefixRegistry => Set<PrefixRegistry>();
    public DbSet<PlatformField> PlatformFields => Set<PlatformField>();
    public DbSet<PlatformAdminGrant> PlatformAdminGrants => Set<PlatformAdminGrant>();
    public DbSet<UserGroup> UserGroups => Set<UserGroup>();
    public DbSet<UserGroupMembership> UserGroupMemberships => Set<UserGroupMembership>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Workspace>(entity =>
        {
            entity.ToTable("Workspaces");
            entity.HasKey(workspace => workspace.WorkspaceId);
            entity.Property(workspace => workspace.Prefix).HasMaxLength(16);
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(user => user.UserId);
            entity.Property(user => user.Theme).HasMaxLength(10);
        });

        // Keyless projection returned by usp_GetUserWorkspaces — read only via FromSqlRaw,
        // never mapped to a table of its own.
        modelBuilder.Entity<UserWorkspaceRow>().HasNoKey().ToView((string?)null);

        modelBuilder.Entity<WorkspaceMembership>(entity =>
        {
            entity.ToTable("WorkspaceMembership");
            entity.HasKey(membership => membership.MembershipId);
        });

        modelBuilder.Entity<PrefixRegistry>(entity =>
        {
            entity.ToTable("PrefixRegistry");
            entity.HasKey(registry => registry.Prefix);
            entity.Property(registry => registry.Prefix).HasMaxLength(16);
        });

        modelBuilder.Entity<PlatformField>(entity =>
        {
            entity.ToTable("PlatformField");
            entity.HasKey(field => field.PlatformFieldId);
        });

        modelBuilder.Entity<PlatformAdminGrant>(entity =>
        {
            entity.ToTable("PlatformAdminGrant");
            entity.HasKey(grant => grant.GrantId);
        });

        modelBuilder.Entity<UserGroup>(entity =>
        {
            entity.ToTable("UserGroup");
            entity.HasKey(group => group.UserGroupId);
        });

        modelBuilder.Entity<UserGroupMembership>(entity =>
        {
            entity.ToTable("UserGroupMembership");
            entity.HasKey(membership => membership.UserGroupMembershipId);
        });

        modelBuilder.Entity<AuditEntry>(entity =>
        {
            entity.ToTable("AuditEntry");
            entity.HasKey(audit => audit.AuditId);
            entity.Property(audit => audit.RecordId).HasMaxLength(20);
        });

        modelBuilder.ApplySoftDeleteFilter();
    }
}

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
            // Slice 21 — SLA due-soon window (migration 049 owns the DB default of 3).
            entity.Property(workspace => workspace.DueSoonWindowDays).HasDefaultValue(3);
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

        // Slice 3 (Fields & objects) — keyless projections read via stored procedures.
        // The field-schema tables are never tracked as EF entities (reads go through procs,
        // writes through usp_UpsertFieldDefinition / usp_RetireFieldDefinition).
        modelBuilder.Entity<FieldDefinitionRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<FieldCatalogRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<FieldOptionRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<FieldRuleRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<FieldDependencyRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<PlatformFieldRow>().HasNoKey().ToView((string?)null);

        // Slice 4 (Lifecycle & gates) — keyless projections read via stored procedures.
        modelBuilder.Entity<LifecycleRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<StageDefinitionRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<GateDefinitionRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<GateSlotRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<RoleLabelRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<ApproverTeamMemberRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<ApproverMemberResultRow>().HasNoKey().ToView((string?)null);

        // Slice 5 (Requests core) — keyless projections read via stored procedures.
        modelBuilder.Entity<RequestRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DraftRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DraftDeleteRow>().HasNoKey().ToView((string?)null);

        // Slice 6 (Comments & activity thread, similar-requests nudge) — keyless proc projections.
        modelBuilder.Entity<ActivityThreadRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<SimilarRequestRow>().HasNoKey().ToView((string?)null);

        // Slice 7 (Tasks) — keyless projections read via stored procedures.
        modelBuilder.Entity<TaskRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<TaskBundleTemplateRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<TaskFieldRow>().HasNoKey().ToView((string?)null);

        // Slice 8 (Gates & approvals) — keyless projections read via stored procedures.
        modelBuilder.Entity<GateForTransitionRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<ApprovalRequestRow>().HasNoKey().ToView((string?)null);

        // Slice 9 (Escalation bridge) — keyless projections read via stored procedures.
        modelBuilder.Entity<CrossingFieldRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<BridgeRow>().HasNoKey().ToView((string?)null);

        // Slice 10 (Closure, Copy, Typed links) — keyless projections read via stored procedures.
        modelBuilder.Entity<TypedLinkRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<TypedLinkDeleteRow>().HasNoKey().ToView((string?)null);

        // Slice 11 (Attachments) — keyless projections read via stored procedures.
        modelBuilder.Entity<AttachmentListRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<AttachmentDownloadRow>().HasNoKey().ToView((string?)null);

        // Slice 12 (Watchers + Notifications) — keyless projections read via stored procedures.
        modelBuilder.Entity<WatcherListRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<MyWatcherPreferencesRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<NotificationRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<UnreadCountRow>().HasNoKey().ToView((string?)null);

        // Slice 13 (Announcements) — keyless projections read via stored procedures.
        modelBuilder.Entity<AnnouncementRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<AnnouncementListRowEntity>().HasNoKey().ToView((string?)null);
        // Announcements scheduler (slice 2) — the newly-published rows returned by usp_TickAnnouncements.
        modelBuilder.Entity<AnnouncementTickRow>().HasNoKey().ToView((string?)null);

        // Slice 14 (Feature Catalog + Saved views) — keyless projections read via stored procedures.
        modelBuilder.Entity<FeatureRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<SavedViewRow>().HasNoKey().ToView((string?)null);

        // Slice 16 (CSV Import & Export) — keyless projections read via stored procedures.
        modelBuilder.Entity<ImportJobRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<ImportReportRow>().HasNoKey().ToView((string?)null);

        // Slice 17 (Users & access admin) — keyless projections read via stored procedures.
        modelBuilder.Entity<WorkspaceMemberRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<MembershipUpsertResultRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<CancelInvitationRow>().HasNoKey().ToView((string?)null);

        // Slice 19 (Platform admin) — keyless projections read via stored procedures.
        modelBuilder.Entity<CrossingMapRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<CrossingCandidateRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<PrivilegedGrantRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<PlatformAdminGrantResultRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<WorkspaceProvisionRow>().HasNoKey().ToView((string?)null);

        // Slice 22 (Home surface) — keyless panel projections read via stored procedures.
        modelBuilder.Entity<HomeDecisionRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<HomeWorkRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<HomeTriageRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<HomePinnedAnnouncementRow>().HasNoKey().ToView((string?)null);

        // Slice 23 (Seeded Dashboards) — keyless CRUD + metric-resolver projections read via stored
        // procedures. The two records-grid procs return two result sets and are read via raw ADO.
        modelBuilder.Entity<DashboardListRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardCategoryCountRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardEscalationQuarterRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardOriginCountRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardOutcomeCountRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardHeatmapCellRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardAnalystCountRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardScalarCountRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardMedianTriageRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardAgingBucketRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardTypeCountRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardTechCountRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<DashboardEscalationStatusRow>().HasNoKey().ToView((string?)null);
        // Slice 28 (Multi-dashboard composer) — the composed group-by breakdown resolver + create id.
        modelBuilder.Entity<DashboardComposedBreakdownRow>().HasNoKey().ToView((string?)null);
        modelBuilder.Entity<CreatedDashboardIdRow>().HasNoKey().ToView((string?)null);

        // Slice 25 (Object-level Relationships) — keyless projections read via stored procedures.
        modelBuilder.Entity<McDermott.AiTracker.Api.Modules.Relationships.RelationshipRow>()
            .HasNoKey().ToView((string?)null);
        modelBuilder.Entity<McDermott.AiTracker.Api.Modules.Relationships.RecordLinkRow>()
            .HasNoKey().ToView((string?)null);

        // Slice 29 (Toolkit) — keyless projections read via stored procedures.
        modelBuilder.Entity<McDermott.AiTracker.Api.Modules.Toolkit.ToolkitItemRow>()
            .HasNoKey().ToView((string?)null);
        modelBuilder.Entity<McDermott.AiTracker.Api.Modules.Toolkit.ToolkitWorkspaceRow>()
            .HasNoKey().ToView((string?)null);

        // Objects tab (S30) — keyless projections read via stored procedures.
        modelBuilder.Entity<McDermott.AiTracker.Api.Modules.Objects.ObjectDefinitionRow>()
            .HasNoKey().ToView((string?)null);
        modelBuilder.Entity<McDermott.AiTracker.Api.Modules.Objects.ObjectRecordCountsRow>()
            .HasNoKey().ToView((string?)null);

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

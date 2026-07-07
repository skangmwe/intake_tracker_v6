-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Creates dbo.SavedDashboard — a named, workspace-scoped dashboard definition
--              (BS §10.5-10.6, data-model.md §SavedDashboard). A dashboard is a widget list
--              (WidgetsJson) over one object surface (ObjectType = Request | Feature). Slug
--              identifies the four seeded starters (ai-default, ai-workload, feature-catalog,
--              pg-starter); Name/Description are display text. AudienceJson (AnnouncementAudience
--              shape { kind, roles?, userIds? }) drives who sees the dashboard in a list — R1
--              seeds are all { "kind":"everyone" }. IsDefault marks a workspace's landing
--              dashboard; SupportsDrillThrough gates the interactive drill path (forced off for
--              bound Dashboard-viewers API-side, S16). Soft-deleted by default; retiring a
--              dashboard never touches records. Mirrors dbo.SavedView (migration 045). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SavedDashboard', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SavedDashboard
    (
        SavedDashboardId     UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_SavedDashboard_SavedDashboardId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId          UNIQUEIDENTIFIER NOT NULL,
        -- ai-default | ai-workload | feature-catalog | pg-starter — the seeded starter this row is.
        Slug                 NVARCHAR(32)     NOT NULL,
        Name                 NVARCHAR(200)    NOT NULL,
        Description          NVARCHAR(500)    NULL,
        -- Request | Feature — the object surface the widgets read.
        ObjectType           NVARCHAR(16)     NOT NULL,
        -- AnnouncementAudience shape: { "kind":"everyone" } | { "kind":"roles","roles":[...] } |
        -- { "kind":"named","userIds":[...] }. R1 seeds are all "everyone".
        AudienceJson         NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_SavedDashboard_Audience DEFAULT N'{"kind":"everyone"}',
        IsDefault            BIT              NOT NULL CONSTRAINT DF_SavedDashboard_IsDefault DEFAULT 0,
        SupportsDrillThrough BIT              NOT NULL CONSTRAINT DF_SavedDashboard_SupportsDrill DEFAULT 1,
        -- Array of { id, type, title, config:{ metric, objectType?, savedViewId? } }.
        WidgetsJson          NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_SavedDashboard_Widgets DEFAULT N'[]',

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_SavedDashboard_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_SavedDashboard_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_SavedDashboard_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_SavedDashboard PRIMARY KEY CLUSTERED (SavedDashboardId),
        CONSTRAINT FK_SavedDashboard_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_SavedDashboard_Slug CHECK
            (Slug IN (N'ai-default', N'ai-workload', N'feature-catalog', N'pg-starter')),
        CONSTRAINT CK_SavedDashboard_ObjectType CHECK (ObjectType IN (N'Request', N'Feature')),
        CONSTRAINT CK_SavedDashboard_Audience_Json CHECK (ISJSON(AudienceJson) = 1),
        CONSTRAINT CK_SavedDashboard_Widgets_Json  CHECK (ISJSON(WidgetsJson) = 1)
    );
END;
GO

-- The list read path: dashboards in a workspace, keyed by (workspace, IsDeleted). Leads with
-- WorkspaceId so it also serves as the FK index (database-performance.md — every FK column has
-- a non-clustered index). INCLUDE covers the list projection.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SavedDashboard_Workspace' AND object_id = OBJECT_ID(N'dbo.SavedDashboard'))
    CREATE NONCLUSTERED INDEX IX_SavedDashboard_Workspace
        ON dbo.SavedDashboard (WorkspaceId, IsDeleted)
        INCLUDE (Slug, Name, ObjectType, IsDefault, UpdatedAt);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_051_CreateSavedDashboard')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260706_051_CreateSavedDashboard', SUSER_SNAME(), N'Slice 23 — SavedDashboard table (seeded dashboard definitions).');
END;
GO

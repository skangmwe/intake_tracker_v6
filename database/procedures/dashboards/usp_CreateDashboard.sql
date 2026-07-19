-- =============================================
-- Author:      /dev-build-application (Slice 28 — Multi-dashboard composer)
-- Create Date: 2026-07-19
-- Description: Creates a user-composed dashboard (S6 "New dashboard", v2-reconciliation.md §API
--              deltas Multi-dashboard composer). Composed dashboards carry no Slug, IsSeeded = 0,
--              LayoutMode = 'Composed', and SupportsDrillThrough = 0 (their records-table widget
--              opens a record directly rather than re-scoping an embedded grid). Audience is
--              'everyone' — the Visibility column ('Shared' | 'Personal') is what governs list
--              membership (Personal shows to the author only). Access (Member+ for Personal,
--              WorkspaceAdmin for Shared) is enforced API-side before this runs. @WidgetsJson is the
--              initial ordered widget list (may be '[]'; the composer adds widgets afterwards).
--              Returns one row: the new SavedDashboardId.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateDashboard
    @WorkspaceId  UNIQUEIDENTIFIER,
    @Name         NVARCHAR(200),
    @Description  NVARCHAR(500)  = NULL,
    @Visibility   NVARCHAR(20),
    @ObjectType   NVARCHAR(16),
    @WidgetsJson  NVARCHAR(MAX)  = N'[]',
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws       UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @NameLoc  NVARCHAR(200)    = @Name;
    DECLARE @Desc     NVARCHAR(500)    = @Description;
    DECLARE @Vis      NVARCHAR(20)     = @Visibility;
    DECLARE @ObjType  NVARCHAR(16)     = @ObjectType;
    DECLARE @Widgets  NVARCHAR(MAX)    = CASE WHEN @WidgetsJson IS NULL OR ISJSON(@WidgetsJson) = 0 THEN N'[]' ELSE @WidgetsJson END;
    DECLARE @Actor    NVARCHAR(256)    = @ActorUserId;
    DECLARE @NewId    UNIQUEIDENTIFIER = NEWID();
    DECLARE @Now      DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.SavedDashboard
            (SavedDashboardId, WorkspaceId, Slug, Name, Description, ObjectType, AudienceJson,
             IsDefault, SupportsDrillThrough, WidgetsJson, IsSeeded, Visibility, LayoutMode,
             CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        VALUES
            (@NewId, @Ws, NULL, @NameLoc, @Desc, @ObjType, N'{"kind":"everyone"}',
             0, 0, @Widgets, 0, @Vis, N'Composed',
             @Actor, @Actor, @Now, @Now);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT @NewId AS SavedDashboardId;
END;
GO

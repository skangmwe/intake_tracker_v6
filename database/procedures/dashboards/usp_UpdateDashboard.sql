-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Updates a dashboard's editable metadata (S32 management panel, BS §10.5). The
--              WorkspaceAdmin authorization is enforced API-side before this runs; the proc writes
--              what it is given. @Name and @AudienceJson are COALESCE-updated (only overwritten
--              when the caller supplies a value), so a partial PATCH leaves the other field
--              untouched. @Retire = 1 soft-deletes the dashboard (IsDeleted = 1, DeletedAt = now) —
--              retiring never touches records. UpdatedAt/UpdatedBy are always stamped. No result
--              set (the API re-reads via usp_GetDashboardById).
--
--              v2 (slice 28): also COALESCE-updates @Visibility ('Shared' | 'Personal') and
--              @WidgetsJson (the composed dashboard's ordered widget list — used for widget
--              add/edit/remove/reorder, which the API serializes and passes whole). The seeded
--              read-only guard for these two composer fields lives API-side (403 before this runs);
--              this proc trusts what it is given.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpdateDashboard
    @SavedDashboardId UNIQUEIDENTIFIER,
    @Name             NVARCHAR(200)  = NULL,
    @AudienceJson     NVARCHAR(MAX)  = NULL,
    @Retire           BIT            = 0,
    @Visibility       NVARCHAR(20)   = NULL,
    @WidgetsJson      NVARCHAR(MAX)  = NULL,
    @ActorUserId      NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IdLocal   UNIQUEIDENTIFIER = @SavedDashboardId;
    DECLARE @NameLocal NVARCHAR(200)    = @Name;
    DECLARE @Audience  NVARCHAR(MAX)    = @AudienceJson;
    DECLARE @RetireLoc BIT              = ISNULL(@Retire, 0);
    DECLARE @Vis       NVARCHAR(20)     = @Visibility;
    DECLARE @Widgets   NVARCHAR(MAX)    = CASE WHEN @WidgetsJson IS NOT NULL AND ISJSON(@WidgetsJson) = 1 THEN @WidgetsJson ELSE NULL END;
    DECLARE @Actor     NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now       DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.SavedDashboard
        SET Name         = COALESCE(@NameLocal, Name),
            AudienceJson = COALESCE(@Audience, AudienceJson),
            Visibility   = COALESCE(@Vis, Visibility),
            WidgetsJson  = COALESCE(@Widgets, WidgetsJson),
            IsDeleted    = CASE WHEN @RetireLoc = 1 THEN 1 ELSE IsDeleted END,
            DeletedAt    = CASE WHEN @RetireLoc = 1 THEN @Now ELSE DeletedAt END,
            UpdatedBy    = @Actor,
            UpdatedAt    = @Now
        WHERE SavedDashboardId = @IdLocal
          AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

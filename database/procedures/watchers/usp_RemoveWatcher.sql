-- =============================================
-- Author:      /dev-build-application (Slice 12 — Watchers)
-- Create Date: 2026-07-05
-- Description: Unsubscribes @TargetUserId from a record — a soft clear (UnsubscribedAt), never a
--              row delete, so history is retained and a later re-subscribe re-uses the row.
--              Idempotent: unsubscribing when not watching is a no-op. Access is gated on
--              @ActorUserId's membership of the record's workspace (defense in depth). The
--              service enforces the self-vs-admin rule (removing another user requires
--              WorkspaceAdmin) before calling.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RemoveWatcher
    @RecordId     NVARCHAR(20),
    @WorkspaceId  UNIQUEIDENTIFIER,
    @TargetUserId UNIQUEIDENTIFIER,
    @ActorUserId  UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Target UNIQUEIDENTIFIER = @TargetUserId;
    DECLARE @Actor  UNIQUEIDENTIFIER = @ActorUserId;
    DECLARE @Now    DATETIME2        = SYSUTCDATETIME();
    DECLARE @ByText NVARCHAR(256)    = CAST(@ActorUserId AS NVARCHAR(256));

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Access gate: actor must be a member of the record's workspace.
        IF NOT EXISTS (
            SELECT 1
            FROM dbo.Requests AS r
            INNER JOIN dbo.WorkspaceMembership AS m
                ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @Actor AND m.IsDeleted = 0
            WHERE r.RecordId = @Record AND r.WorkspaceId = @Ws AND r.IsDeleted = 0)
        BEGIN
            COMMIT TRANSACTION;
            RETURN;
        END;

        UPDATE dbo.Watchers
        SET UnsubscribedAt = @Now,
            UpdatedAt      = @Now,
            UpdatedBy      = @ByText
        WHERE RecordId = @Record AND WorkspaceId = @Ws AND UserId = @Target
          AND UnsubscribedAt IS NULL AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

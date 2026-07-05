-- =============================================
-- Author:      /dev-build-application (Slice 12 — Watchers)
-- Create Date: 2026-07-05
-- Description: Subscribes @TargetUserId to a record (BS §17.3). Idempotent — a re-subscribe
--              re-uses the existing row (reactivating a soft-cleared one), so the filtered
--              UNIQUE index is never violated and there is at most one row per (record, side,
--              user). Access is gated on @ActorUserId's membership of the record's workspace
--              (api-record-access.md — defense in depth; the service also resolves the caller's
--              side via usp_GetRequestByIdForUser first). A denied actor inserts ZERO rows.
--
--              The service enforces the self-vs-admin rule (adding another user requires
--              WorkspaceAdmin) before calling; this proc only guards workspace membership.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_AddWatcher
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

        -- Access gate: the record must exist on a workspace the actor is a member of.
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

        -- Reactivate an existing row (active or soft-cleared) for this (record, side, user);
        -- insert only when none exists. Keeps exactly one row per tuple.
        UPDATE dbo.Watchers
        SET UnsubscribedAt = NULL,
            SubscribedAt   = CASE WHEN UnsubscribedAt IS NOT NULL THEN @Now ELSE SubscribedAt END,
            UpdatedAt      = @Now,
            UpdatedBy      = @ByText
        WHERE RecordId = @Record AND WorkspaceId = @Ws AND UserId = @Target AND IsDeleted = 0;

        IF @@ROWCOUNT = 0
            INSERT INTO dbo.Watchers
                (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, CreatedBy, UpdatedBy)
            VALUES
                (NEWID(), @Record, @Ws, @Target, @Now, @ByText, @ByText);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

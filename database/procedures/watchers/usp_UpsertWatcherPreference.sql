-- =============================================
-- Author:      /dev-build-application (Slice 26 — per-record notification preferences)
-- Create Date: 2026-07-17
-- Description: Sparse upsert of the caller's WatcherNotificationPreference row for one record.
--              Each of the five booleans carries a paired @Set* flag so "set to null" and "leave
--              unchanged" are distinguishable; a @Set*=0 leaves the existing value alone. The
--              first divergent write inserts the row (all defaults 1); subsequent writes update
--              in place. Rows are never deleted on unsubscribe — the addendum specifies that
--              preferences persist so they're restored on re-subscribe.
--
--              Access-gated on the caller's membership of the record's workspace — a caller who
--              cannot see the record touches ZERO rows and the API's re-read returns nothing
--              (→ 403, api-record-access.md floor).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertWatcherPreference
    @RecordId                        NVARCHAR(20),
    @WorkspaceId                     UNIQUEIDENTIFIER,
    @UserId                          UNIQUEIDENTIFIER,
    @SetNotifyGateDecisions          BIT,
    @NotifyGateDecisions             BIT,
    @SetNotifyStatusChanges          BIT,
    @NotifyStatusChanges             BIT,
    @SetNotifyTaskSignoffs           BIT,
    @NotifyTaskSignoffs              BIT,
    @SetNotifySlaAndDueDateReminders BIT,
    @NotifySlaAndDueDateReminders    BIT,
    @SetNotifyMentionsAndComments    BIT,
    @NotifyMentionsAndComments       BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;
    DECLARE @Now    DATETIME2        = SYSUTCDATETIME();
    DECLARE @ByText NVARCHAR(256)    = CAST(@UserId AS NVARCHAR(256));

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Access gate: the record must exist on a workspace the caller is a member of.
        IF NOT EXISTS (
            SELECT 1
            FROM dbo.Requests AS r
            INNER JOIN dbo.WorkspaceMembership AS m
                ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
            WHERE r.RecordId = @Record AND r.WorkspaceId = @Ws AND r.IsDeleted = 0)
        BEGIN
            COMMIT TRANSACTION;
            RETURN;
        END;

        -- Sparse in-place update. Only fires when a live row already exists.
        UPDATE dbo.WatcherNotificationPreference
        SET NotifyGateDecisions          = CASE WHEN @SetNotifyGateDecisions          = 1 THEN @NotifyGateDecisions          ELSE NotifyGateDecisions          END,
            NotifyStatusChanges          = CASE WHEN @SetNotifyStatusChanges          = 1 THEN @NotifyStatusChanges          ELSE NotifyStatusChanges          END,
            NotifyTaskSignoffs           = CASE WHEN @SetNotifyTaskSignoffs           = 1 THEN @NotifyTaskSignoffs           ELSE NotifyTaskSignoffs           END,
            NotifySlaAndDueDateReminders = CASE WHEN @SetNotifySlaAndDueDateReminders = 1 THEN @NotifySlaAndDueDateReminders ELSE NotifySlaAndDueDateReminders END,
            NotifyMentionsAndComments    = CASE WHEN @SetNotifyMentionsAndComments    = 1 THEN @NotifyMentionsAndComments    ELSE NotifyMentionsAndComments    END,
            UpdatedAt                    = @Now,
            UpdatedBy                    = @ByText
        WHERE UserId = @User AND RecordId = @Record AND WorkspaceId = @Ws AND IsDeleted = 0;

        -- No existing live row → insert one starting from the defaults (all 1), then apply
        -- the same @Set* mask so the initial row already reflects the caller's edits.
        IF @@ROWCOUNT = 0
        BEGIN
            INSERT INTO dbo.WatcherNotificationPreference
                (PreferenceId, UserId, RecordId, WorkspaceId,
                 NotifyGateDecisions, NotifyStatusChanges, NotifyTaskSignoffs,
                 NotifySlaAndDueDateReminders, NotifyMentionsAndComments,
                 CreatedBy, UpdatedBy)
            VALUES
                (NEWID(), @User, @Record, @Ws,
                 CASE WHEN @SetNotifyGateDecisions          = 1 THEN @NotifyGateDecisions          ELSE 1 END,
                 CASE WHEN @SetNotifyStatusChanges          = 1 THEN @NotifyStatusChanges          ELSE 1 END,
                 CASE WHEN @SetNotifyTaskSignoffs           = 1 THEN @NotifyTaskSignoffs           ELSE 1 END,
                 CASE WHEN @SetNotifySlaAndDueDateReminders = 1 THEN @NotifySlaAndDueDateReminders ELSE 1 END,
                 CASE WHEN @SetNotifyMentionsAndComments    = 1 THEN @NotifyMentionsAndComments    ELSE 1 END,
                 @ByText, @ByText);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

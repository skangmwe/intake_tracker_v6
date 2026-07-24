-- =============================================
-- Author:      Announcements platform broadcast
-- Create Date: 2026-07-24
-- Description: The per-workspace copies of one broadcast — AnnouncementId + WorkspaceId + stored Status —
--              used by the service to fan out the bell event once per copy when a Scheduled broadcast is
--              published early via edit (the scheduled→published tick already fans out per copy on time).
--              Excludes soft-deleted rows.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetBroadcastCopies
    @BroadcastId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT
        a.AnnouncementId,
        a.WorkspaceId,
        a.Status
    FROM dbo.Announcements AS a
    WHERE a.BroadcastId = @BroadcastId
      AND a.IsDeleted = 0;
END;
GO

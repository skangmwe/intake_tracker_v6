-- =============================================
-- Author:      /dev-build-application (Slice 10 — Typed links)
-- Create Date: 2026-07-04
-- Description: Soft-deletes a typed link (audit-preserved — BS §2.2). Access is baked into the
--              write: the link is removed only when the caller is a member of a workspace that
--              holds the link's FROM record, so a caller who cannot see the near record deletes
--              nothing. Returns the affected-row count; the API maps 0 → 403 (never discloses the
--              link's existence — BS §22.6). Idempotent: an already-deleted link affects 0 rows.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeleteTypedLink
    @LinkId      UNIQUEIDENTIFIER,
    @UserId      UNIQUEIDENTIFIER,
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @LinkIdLocal UNIQUEIDENTIFIER = @LinkId;
    DECLARE @UserIdLocal UNIQUEIDENTIFIER = @UserId;
    DECLARE @Actor       NVARCHAR(256)    = @ActorUserId;

    -- Capture the FROM record of the soft-deleted link (for the removal event) via the OUTPUT clause.
    DECLARE @Removed TABLE (FromRecordId NVARCHAR(20));

    UPDATE tl
    SET tl.IsDeleted = 1,
        tl.DeletedAt = SYSUTCDATETIME(),
        tl.UpdatedBy = @Actor,
        tl.UpdatedAt = SYSUTCDATETIME()
    OUTPUT deleted.FromRecordId INTO @Removed (FromRecordId)
    FROM dbo.TypedLinks AS tl
    WHERE tl.LinkId = @LinkIdLocal
      AND tl.IsDeleted = 0
      AND EXISTS (
          SELECT 1
          FROM dbo.Requests AS r
          INNER JOIN dbo.WorkspaceMembership AS m
              ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @UserIdLocal AND m.IsDeleted = 0
          WHERE r.RecordId = tl.FromRecordId AND r.IsDeleted = 0
      );

    SELECT @@ROWCOUNT AS Deleted, (SELECT TOP (1) FromRecordId FROM @Removed) AS FromRecordId;
END;
GO

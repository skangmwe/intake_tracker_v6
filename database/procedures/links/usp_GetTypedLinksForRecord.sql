-- =============================================
-- Author:      /dev-build-application (Slice 10 — Typed links)
-- Create Date: 2026-07-04
-- Description: Lists the outgoing typed links for a record — the Relationships side-panel card
--              (BS §2.2). Access to the record is gated API-side (the caller must be able to see
--              it) before this runs; this read only resolves the FAR side access-respectingly.
--
--              Each row carries the far record's Name + Stage when the caller can see the far
--              record; both are NULL otherwise, so an out-of-scope far record is never disclosed
--              beyond its id (BS §22.6). Newest first.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTypedLinksForRecord
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @UserIdLocal   UNIQUEIDENTIFIER = @UserId;

    SELECT
        tl.LinkId,
        tl.FromRecordId,
        tl.ToRecordId,
        tl.LinkKind,
        tl.Rationale,
        far.Name  AS ToName,
        far.Stage AS ToStage,
        tl.CreatedAt
    FROM dbo.TypedLinks AS tl
    OUTER APPLY (
        SELECT TOP (1) r.Name, r.Stage
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @UserIdLocal AND m.IsDeleted = 0
        WHERE r.RecordId = tl.ToRecordId AND r.IsDeleted = 0
    ) AS far
    WHERE tl.FromRecordId = @RecordIdLocal
      AND tl.IsDeleted = 0
    ORDER BY tl.CreatedAt DESC;
END;
GO

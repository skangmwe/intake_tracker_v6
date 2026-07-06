-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Returns the single Feature row for @RecordId that @UserId is entitled to see —
--              access is baked into the query via a JOIN to WorkspaceMembership (api-record-
--              access.md: detail read paths filter in the query, never fetch-all-then-hide). A
--              feature the caller cannot see, or a non-existent id, both return ZERO rows, so the
--              API returns 403 uniformly and never discloses record existence (BS §22.6).
--
--              Features live on the AI Solutions workspace only, so in Phase 1 the caller must be
--              an AI-workspace member. Firm-wide read-only access to Published features (via the
--              Dashboard-viewer surface, BS §10.4) is slice 23 — not wired here.
--              RowVer is returned for the PATCH ETag.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetFeatureByIdForUser
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @UserIdLocal   UNIQUEIDENTIFIER = @UserId;

    SELECT
        f.RecordId,
        f.WorkspaceId,
        f.Origin,
        f.Name,
        f.Maturity,
        f.FieldValues,
        f.CreatedAt,
        f.UpdatedAt,
        f.CreatedBy,
        f.UpdatedBy,
        f.RowVer
    FROM dbo.Features AS f
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = f.WorkspaceId
       AND m.UserId = @UserIdLocal
       AND m.IsDeleted = 0
    WHERE f.RecordId = @RecordIdLocal
      AND f.IsDeleted = 0;
END;
GO

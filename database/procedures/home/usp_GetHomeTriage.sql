-- =============================================
-- Author:      /dev-build-application (Slice 22 — Home surface)
-- Create Date: 2026-07-06
-- Description: Home "New to triage" panel (BS §10.7). Returns the open, unassigned records in
--              @WorkspaceId — awaiting an analyst. Phase 1 has no assignee user reference; "unassigned"
--              is the absence of the AssignedAnalyst field value (module-boundaries §16). "Open" = not
--              yet closed (no outcome). Newest received first. Access is verified API-side; workspace-
--              scoped here (defence in depth). TotalCount rides as a windowed column for the panel
--              count. Params copied to locals (parameter-sniffing mitigation).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetHomeTriage
    @UserId      UNIQUEIDENTIFIER,
    @WorkspaceId UNIQUEIDENTIFIER,
    @Top         INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @TopL INT = CASE WHEN @Top < 1 THEN 20 WHEN @Top > 100 THEN 100 ELSE @Top END;

    SELECT
        r.RecordId                                                        AS RecordId,
        r.Name                                                            AS Name,
        COALESCE(NULLIF(r.Origin, N''), NULLIF(r.DeptPgClient, N''), N'—') AS Origin,
        r.CreatedAt                                                       AS ReceivedAt,
        COUNT(*) OVER ()                                                  AS TotalCount
    FROM dbo.Requests AS r
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND (r.AssignedAnalyst IS NULL OR r.AssignedAnalyst = N'')
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
    ORDER BY r.CreatedAt DESC, r.RecordId ASC
    OFFSET 0 ROWS FETCH NEXT @TopL ROWS ONLY;
END;
GO

-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: The S39 Firm-wide audit log (BS §12, §4.3). Same shape as usp_QueryWorkspaceAudit
--              but spans EVERY workspace — including Platform-admin edits to platform-defined
--              fields — and adds the WorkspaceName to each row so the cross-workspace list is
--              legible. Optional filters (each ANDed): workspace, date range, actor, record,
--              event type. Two result sets: (1) the page rows, (2) a single-column TotalCount
--              (mirrors usp_QueryWorkspaceAudit / usp_SearchFull so the API reads them uniformly).
--
--              Access: the single authoritative check — caller holds the Platform-admin grant — is
--              made in the API controller (api-record-access.md). This proc is NOT visible to
--              workspace admins (S39 is platform-only). AuditEntry is append-only; this proc only
--              reads. DisplayName is PII (api-pii-handling.md) — returned for the surface, never
--              logged. Params copied to locals to mitigate parameter sniffing.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryFirmWideAudit
    @WorkspaceId  UNIQUEIDENTIFIER = NULL,
    @DateFrom     DATE             = NULL,
    @DateTo       DATE             = NULL,
    @ActorUserId  UNIQUEIDENTIFIER = NULL,
    @RecordId     NVARCHAR(20)     = NULL,
    @EventType    NVARCHAR(64)     = NULL,
    @Page         INT              = 1,
    @PageSize     INT              = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws        UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @From      DATE             = @DateFrom;
    DECLARE @To        DATE             = @DateTo;
    DECLARE @Actor     UNIQUEIDENTIFIER = @ActorUserId;
    DECLARE @Record    NVARCHAR(20)     = NULLIF(LTRIM(RTRIM(@RecordId)), N'');
    DECLARE @Event     NVARCHAR(64)     = NULLIF(LTRIM(RTRIM(@EventType)), N'');
    DECLARE @PageLocal INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size      INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @ToExclusive DATETIME2 = CASE WHEN @To IS NULL THEN NULL ELSE DATEADD(DAY, 1, CAST(@To AS DATETIME2)) END;

    SELECT
        a.AuditId       AS AuditId,
        a.WorkspaceId   AS WorkspaceId,
        ws.Name         AS WorkspaceName,
        a.RecordId      AS RecordId,
        a.ObjectType    AS ObjectType,
        a.EventType     AS EventType,
        a.ActorUserId   AS ActorUserId,
        u.DisplayName   AS ActorName,
        a.EventAt       AS EventAt,
        a.EventPayload  AS EventPayload
    FROM dbo.AuditEntry AS a
    LEFT JOIN dbo.Users AS u ON u.UserId = a.ActorUserId
    LEFT JOIN dbo.Workspaces AS ws ON ws.WorkspaceId = a.WorkspaceId
    WHERE (@Ws IS NULL OR a.WorkspaceId = @Ws)
      AND (@From IS NULL OR a.EventAt >= CAST(@From AS DATETIME2))
      AND (@ToExclusive IS NULL OR a.EventAt < @ToExclusive)
      AND (@Actor IS NULL OR a.ActorUserId = @Actor)
      AND (@Record IS NULL OR a.RecordId = @Record)
      AND (@Event IS NULL OR a.EventType = @Event)
    ORDER BY a.EventAt DESC, a.AuditId DESC
    OFFSET (@PageLocal - 1) * @Size ROWS
    FETCH NEXT @Size ROWS ONLY;

    SELECT COUNT(*) AS TotalCount
    FROM dbo.AuditEntry AS a
    WHERE (@Ws IS NULL OR a.WorkspaceId = @Ws)
      AND (@From IS NULL OR a.EventAt >= CAST(@From AS DATETIME2))
      AND (@ToExclusive IS NULL OR a.EventAt < @ToExclusive)
      AND (@Actor IS NULL OR a.ActorUserId = @Actor)
      AND (@Record IS NULL OR a.RecordId = @Record)
      AND (@Event IS NULL OR a.EventType = @Event);
END;
GO

-- =============================================
-- Author:      /dev-build-application (Slice 18 — Views & dashboards admin + workspace audit)
-- Create Date: 2026-07-06
-- Description: The S33 Workspace audit log (BS §12). Returns a page of the workspace's append-only
--              AuditEntry rows, newest first, joined to Users for the actor's display name, with
--              optional filters — date range, actor, record, event type — each ANDed. Two result
--              sets: (1) the page rows, (2) a single-column TotalCount (mirrors usp_SearchFull, so
--              the API reads them uniformly).
--
--              Access: this proc is workspace-scoped (every row is filtered to @WorkspaceId). The
--              single authoritative access check — caller is a WorkspaceAdmin of @WorkspaceId — is
--              made in the API controller (api-record-access.md); the workspace scope here is
--              defence-in-depth, not the boundary. AuditEntry is append-only (INSTEAD OF trigger
--              blocks mutation); this proc only reads.
--
--              DisplayName is PII (api-pii-handling.md): the entitled admin may read it here, but it
--              is never written to a log. The proc returns it for the surface only.
--
--              Uses the IX_AuditEntry_Workspace_EventAt_EventType index created in slice 1 for this
--              query. Params copied to locals to mitigate parameter sniffing
--              (database-stored-procedures.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryWorkspaceAudit
    @WorkspaceId  UNIQUEIDENTIFIER,
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
    -- Inclusive upper bound: everything strictly before the day after @To.
    DECLARE @ToExclusive DATETIME2 = CASE WHEN @To IS NULL THEN NULL ELSE DATEADD(DAY, 1, CAST(@To AS DATETIME2)) END;

    -- Page rows — newest first, actor name resolved (null for system events / unknown actor).
    SELECT
        a.AuditId       AS AuditId,
        a.WorkspaceId   AS WorkspaceId,
        a.RecordId      AS RecordId,
        a.ObjectType    AS ObjectType,
        a.EventType     AS EventType,
        a.ActorUserId   AS ActorUserId,
        u.DisplayName   AS ActorName,
        a.EventAt       AS EventAt,
        a.EventPayload  AS EventPayload
    FROM dbo.AuditEntry AS a
    LEFT JOIN dbo.Users AS u ON u.UserId = a.ActorUserId
    WHERE a.WorkspaceId = @Ws
      AND (@From IS NULL OR a.EventAt >= CAST(@From AS DATETIME2))
      AND (@ToExclusive IS NULL OR a.EventAt < @ToExclusive)
      AND (@Actor IS NULL OR a.ActorUserId = @Actor)
      AND (@Record IS NULL OR a.RecordId = @Record)
      AND (@Event IS NULL OR a.EventType = @Event)
    ORDER BY a.EventAt DESC, a.AuditId DESC
    OFFSET (@PageLocal - 1) * @Size ROWS
    FETCH NEXT @Size ROWS ONLY;

    -- Total count for the same filter set (INT — read as Int32 API-side, mirrors usp_SearchFull).
    SELECT COUNT(*) AS TotalCount
    FROM dbo.AuditEntry AS a
    WHERE a.WorkspaceId = @Ws
      AND (@From IS NULL OR a.EventAt >= CAST(@From AS DATETIME2))
      AND (@ToExclusive IS NULL OR a.EventAt < @ToExclusive)
      AND (@Actor IS NULL OR a.ActorUserId = @Actor)
      AND (@Record IS NULL OR a.RecordId = @Record)
      AND (@Event IS NULL OR a.EventType = @Event);
END;
GO

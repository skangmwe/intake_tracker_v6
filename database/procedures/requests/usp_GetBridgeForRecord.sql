-- =============================================
-- Author:      /dev-build-application (Slice 9 — Escalation bridge)
-- Create Date: 2026-07-04
-- Description: Returns the escalation-bridge inputs for @RecordId, or zero rows when the
--              record is not escalated or the caller cannot see any side of it. The API
--              composes the DTO bridge block (BS §6.4) from this single row:
--                - the caller must be a member of at least one side (membership-gated) —
--                  no membership → zero rows → no bridge block surfaces;
--                - escalation is detected structurally: an AI-side row (Workspaces.Kind =
--                  'ai-solutions') AND a PG-side row sharing the RecordId. Because prefixes
--                  are globally unique and minted per workspace, two rows sharing a RecordId
--                  across workspaces can only arise from escalation adopting the shared key.
--
--              The AI-side row is read WITHOUT a membership gate on purpose: the AI Solutions
--              Status mirror is system-computed and is explicitly allowed to surface on the PG
--              side (BS §6.4), even to a PG viewer with no AI-workspace access. The mirror
--              STATUS STRING is derived API-side (read-time) from AiStage + hold/outcome in
--              AiFieldValues — there is no manual write path and nothing stored (slice-9
--              decision: read-time derivation; a stored+event-driven field lands in Phase 2
--              when the condition engine keys on it). LockedFieldKeysJson lists the PG-side
--              crossing snapshot keys that render the "⇄ Crossed · locked on PG" markers.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetBridgeForRecord
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Rec  NVARCHAR(20)     = @RecordId;
    DECLARE @User UNIQUEIDENTIFIER = @UserId;

    -- The caller's own side (membership-gated). No membership on any side → no bridge.
    DECLARE @CallerWs UNIQUEIDENTIFIER = (
        SELECT TOP 1 r.WorkspaceId
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
        WHERE r.RecordId = @Rec AND r.IsDeleted = 0);

    -- The AI-side row (system read — the mirror is system-computed, BS §6.4).
    DECLARE @AiWs        UNIQUEIDENTIFIER;
    DECLARE @AiStage     NVARCHAR(64);
    DECLARE @AiFields    NVARCHAR(MAX);
    DECLARE @AiCreatedAt DATETIME2;

    SELECT @AiWs = r.WorkspaceId, @AiStage = r.Stage, @AiFields = r.FieldValues, @AiCreatedAt = r.CreatedAt
    FROM dbo.Requests AS r
    INNER JOIN dbo.Workspaces AS w ON w.WorkspaceId = r.WorkspaceId
    WHERE r.RecordId = @Rec AND r.IsDeleted = 0 AND w.Kind = N'ai-solutions';

    -- "No bridge" cases (no caller membership → @CallerWs NULL; not escalated → @AiWs NULL) must
    -- still emit the same result-set SHAPE so the API's FromSql<BridgeRow> read binds consistently:
    -- an early RETURN yields no result set and EF throws "required column 'AiFieldValues' not present"
    -- (500) for every non-escalated record. The final SELECT's WHERE returns ZERO rows in those cases
    -- instead — the caller sees no bridge block, and membership/escalation gating is unchanged.

    -- The PG-side row (the originating workspace). Origin is the same on both sides.
    DECLARE @PgWs   UNIQUEIDENTIFIER;
    DECLARE @PgName NVARCHAR(200);

    SELECT TOP 1 @PgWs = r.WorkspaceId, @PgName = r.Origin
    FROM dbo.Requests AS r
    INNER JOIN dbo.Workspaces AS w ON w.WorkspaceId = r.WorkspaceId
    WHERE r.RecordId = @Rec AND r.IsDeleted = 0 AND w.Kind <> N'ai-solutions';

    -- The PG-side crossing fields frozen at escalation — the lock markers on S5.
    DECLARE @LockedJson NVARCHAR(MAX) = (
        SELECT s.FieldKey AS [key]
        FROM dbo.RequestCrossingSnapshot AS s
        WHERE s.RecordId = @Rec AND s.WorkspaceId = @PgWs AND s.IsDeleted = 0
        ORDER BY s.FieldKey
        FOR JSON PATH);

    SELECT
        @Rec                        AS RecordId,
        @PgWs                       AS OriginWorkspaceId,
        @PgName                     AS OriginWorkspaceName,
        @AiWs                       AS AiWorkspaceId,
        @AiCreatedAt                AS EscalatedAt,
        @AiStage                    AS AiStage,
        @AiFields                   AS AiFieldValues,
        @CallerWs                   AS CallerWorkspaceId,
        CAST(CASE WHEN @CallerWs = @AiWs THEN 1 ELSE 0 END AS BIT) AS CallerOnAiSide,
        ISNULL(@LockedJson, N'[]')  AS LockedFieldKeysJson
    -- Zero rows (but the full column shape) when the caller is not a member of any side, or the
    -- record is not escalated — replaces the two early RETURNs above (see the note there).
    WHERE @CallerWs IS NOT NULL AND @AiWs IS NOT NULL;
END;
GO

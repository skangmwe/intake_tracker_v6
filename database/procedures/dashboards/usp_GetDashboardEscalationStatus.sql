-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — records whose AI Solutions Status is set vs blank (S15
--              "Escalation status" tile on the PG starter dashboard). Single-row result
--              (SetCnt, BlankCnt) over all non-deleted records in the workspace.
--
--              DIVERGENCE / PROXY (documented per contract §5 + ## Divergences): the "AI Solutions
--              Status" platform field (FieldKey 'ai-solutions-status') has NO manual write path and
--              no PG-side FieldValues write path in the schema — the bridge writes it off the event
--              spine, not into the PG record's FieldValues map. The reliable PG-side signal that a
--              record has engaged AI Solutions (i.e. has an AI Solutions Status) is the presence of
--              a RequestCrossingSnapshot row for the record on this workspace side — written by
--              usp_EscalateRequest at escalation. "Set" = an escalation snapshot exists for the
--              record; "Blank" = none. Scoped to @WorkspaceId AND IsDeleted = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardEscalationStatus
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        ISNULL(SUM(CASE WHEN esc.RecordId IS NOT NULL THEN 1 ELSE 0 END), 0) AS SetCnt,
        ISNULL(SUM(CASE WHEN esc.RecordId IS NULL     THEN 1 ELSE 0 END), 0) AS BlankCnt
    FROM dbo.Requests AS r
    OUTER APPLY (
        SELECT TOP (1) snap.RecordId
        FROM dbo.RequestCrossingSnapshot AS snap
        WHERE snap.RecordId = r.RecordId
          AND snap.WorkspaceId = r.WorkspaceId
          AND snap.IsDeleted = 0
    ) AS esc
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0;
END;
GO

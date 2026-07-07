-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — escalations this quarter vs the prior quarter, by Origin
--              (S6 "Escalations this quarter"). An AI-side record is "escalated" when a
--              RequestCrossingSnapshot row exists for its shared RecordId (the snapshot is written
--              by usp_EscalateRequest at the escalation moment — its presence IS the escalation
--              signal). The escalation event time is the earliest SnapshotAt for the record
--              (a record snapshots several crossing fields at once). Quarters are calendar
--              quarters of that event. Origin is the AI-side record's Dept/PG/Client (fallback to
--              its Origin, then '— (unset)'). Scoped to @WorkspaceId (the AI workspace) AND
--              IsDeleted = 0. Empty set when no escalations fall in either quarter.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardEscalationsByQuarter
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws         UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Now        DATETIME2        = SYSUTCDATETIME();
    DECLARE @QStart     DATE = DATEFROMPARTS(YEAR(@Now), ((DATEPART(QUARTER, @Now) - 1) * 3) + 1, 1);
    DECLARE @QEnd       DATE = DATEADD(QUARTER, 1, @QStart);   -- exclusive upper bound
    DECLARE @PriorStart DATE = DATEADD(QUARTER, -1, @QStart);

    ;WITH Escalated AS (
        SELECT
            r.RecordId,
            COALESCE(NULLIF(r.DeptPgClient, N''), NULLIF(r.Origin, N''), N'— (unset)') AS OriginLabel,
            MIN(snap.SnapshotAt) AS EscalatedAt
        FROM dbo.Requests AS r
        INNER JOIN dbo.RequestCrossingSnapshot AS snap
            ON snap.RecordId = r.RecordId
           AND snap.IsDeleted = 0
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
        GROUP BY r.RecordId,
                 COALESCE(NULLIF(r.DeptPgClient, N''), NULLIF(r.Origin, N''), N'— (unset)')
    )
    SELECT
        e.OriginLabel AS Origin,
        SUM(CASE WHEN e.EscalatedAt >= @QStart     AND e.EscalatedAt < @QEnd   THEN 1 ELSE 0 END) AS ThisCnt,
        SUM(CASE WHEN e.EscalatedAt >= @PriorStart AND e.EscalatedAt < @QStart THEN 1 ELSE 0 END) AS PriorCnt
    FROM Escalated AS e
    WHERE e.EscalatedAt >= @PriorStart AND e.EscalatedAt < @QEnd
    GROUP BY e.OriginLabel
    ORDER BY ThisCnt DESC, Origin ASC;
END;
GO

-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — median days to first triage, trailing @WindowDays vs the prior
--              @WindowDays (S14 "Median time-to-first-triage"). Single-row result
--              (MedianDays FLOAT, PriorMedianDays FLOAT); NULL when a window has no qualifying
--              records.
--
--              APPROXIMATION (documented per contract): the exact first-AssignedAnalyst timestamp
--              is not reliably reconstructable (the audit spine records assignment events but with
--              no stable typed marker to key on here), so triage time is approximated as
--              DATEDIFF(day, CreatedAt, StageEnteredAt) — creation to the entry of the record's
--              current stage — over records that HAVE since been assigned an analyst. StageEnteredAt
--              (slice 21) backfills to Submitted for legacy rows. Windows bucket by CreatedAt:
--              current = [now-@WindowDays, now); prior = [now-2*@WindowDays, now-@WindowDays).
--              Median via PERCENTILE_CONT(0.5). Scoped to @WorkspaceId AND IsDeleted = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardMedianTimeToTriage
    @WorkspaceId UNIQUEIDENTIFIER,
    @WindowDays  INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws         UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Window     INT       = CASE WHEN @WindowDays IS NULL OR @WindowDays < 1 THEN 30 ELSE @WindowDays END;
    DECLARE @Now        DATETIME2 = SYSUTCDATETIME();
    DECLARE @CurStart   DATETIME2 = DATEADD(DAY, -@Window, @Now);
    DECLARE @PriorStart DATETIME2 = DATEADD(DAY, -2 * @Window, @Now);

    DECLARE @MedianDays      FLOAT;
    DECLARE @PriorMedianDays FLOAT;

    -- Current window median. PERCENTILE_CONT is a window function returning the same value on every
    -- qualifying row; DISTINCT collapses it to a single scalar (NULL when the window has no rows).
    SET @MedianDays = (
        SELECT DISTINCT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CAST(DATEDIFF(DAY, r.CreatedAt, r.StageEnteredAt) AS FLOAT)) OVER ()
        FROM dbo.Requests AS r
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
          AND r.StageEnteredAt IS NOT NULL
          AND r.AssignedAnalyst IS NOT NULL
          AND r.AssignedAnalyst <> N''
          AND r.AssignedAnalyst <> N'—'
          AND r.CreatedAt >= @CurStart
          AND r.CreatedAt < @Now);

    -- Prior window median.
    SET @PriorMedianDays = (
        SELECT DISTINCT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CAST(DATEDIFF(DAY, r.CreatedAt, r.StageEnteredAt) AS FLOAT)) OVER ()
        FROM dbo.Requests AS r
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
          AND r.StageEnteredAt IS NOT NULL
          AND r.AssignedAnalyst IS NOT NULL
          AND r.AssignedAnalyst <> N''
          AND r.AssignedAnalyst <> N'—'
          AND r.CreatedAt >= @PriorStart
          AND r.CreatedAt < @CurStart);

    SELECT @MedianDays AS MedianDays, @PriorMedianDays AS PriorMedianDays;
END;
GO

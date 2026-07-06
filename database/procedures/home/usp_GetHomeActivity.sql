-- =============================================
-- Author:      /dev-build-application (Slice 22 — Home surface)
-- Create Date: 2026-07-06
-- Description: Home "Since you were last here" panel (BS §10.7). Returns record-level audit activity in
--              @WorkspaceId newer than the caller's previous Home visit, then stamps LastHomeSeenAt to
--              now so the NEXT load shows only what changed since this one. The prior value is captured
--              before the update and returned via @SinceLastSeenAt OUTPUT (drives the "Since ..."
--              header even when the list is empty). First visit (NULL) falls back to a 7-day window so a
--              new user still lands with context. Only record events (RecordId IS NOT NULL) — config /
--              workspace-level audit entries are noise on this panel (matches the prototype).
--
--              Access: workspace-scoped (caller's membership verified API-side); any workspace member
--              may read that workspace's record activity (record access = workspace membership in R1,
--              api-record-access.md). ActorName (DisplayName) is PII (api-pii-handling.md) — returned
--              for the surface only, never logged. Newest first; capped by @Top.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetHomeActivity
    @UserId          UNIQUEIDENTIFIER,
    @WorkspaceId     UNIQUEIDENTIFIER,
    @Top             INT = 20,
    @SinceLastSeenAt DATETIME2 OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @User UNIQUEIDENTIFIER = @UserId;
    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @TopL INT = CASE WHEN @Top < 1 THEN 20 WHEN @Top > 100 THEN 100 ELSE @Top END;
    DECLARE @Now  DATETIME2 = SYSUTCDATETIME();

    -- Capture the prior visit BEFORE stamping the new one. NULL = first ever Home load.
    DECLARE @Prev DATETIME2 = (SELECT LastHomeSeenAt FROM dbo.Users WHERE UserId = @User);
    SET @SinceLastSeenAt = @Prev;
    DECLARE @Since DATETIME2 = COALESCE(@Prev, DATEADD(DAY, -7, @Now));

    -- Stamp this visit (own row; audit columns move with it).
    UPDATE dbo.Users
    SET LastHomeSeenAt = @Now,
        UpdatedAt      = @Now,
        UpdatedBy      = CAST(@User AS NVARCHAR(36))
    WHERE UserId = @User;

    SELECT TOP (@TopL)
        a.RecordId                 AS RecordId,
        ISNULL(r.Name, N'')        AS Name,
        a.EventType                AS EventType,
        a.ActorUserId              AS ActorUserId,
        u.DisplayName              AS ActorName,
        a.EventAt                  AS EventAt
    FROM dbo.AuditEntry AS a
    LEFT JOIN dbo.Users AS u ON u.UserId = a.ActorUserId
    LEFT JOIN dbo.Requests AS r
        ON r.WorkspaceId = a.WorkspaceId AND r.RecordId = a.RecordId AND r.IsDeleted = 0
    WHERE a.WorkspaceId = @Ws
      AND a.RecordId IS NOT NULL
      AND a.EventAt > @Since
    ORDER BY a.EventAt DESC, a.AuditId DESC;
END;
GO

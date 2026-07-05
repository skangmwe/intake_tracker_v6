-- =============================================
-- Author:      /dev-build-application (Slice 12 — Notifications fan-out; extended slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Materialises per-user bell notifications from one event-spine event
--              (module-boundaries §16/§20). Called IN-PROCESS by NotificationFanoutConsumer right
--              after the audit row is written, on the caller's transaction — so the notification
--              rows commit atomically with the state change (the Service-Bus/Worker path is a no-op
--              in dev, same as slice 9's mirror). Like usp_EmitAuditEntry there is NO explicit
--              transaction here: it is designed to run inside the caller's.
--
--              Targets by event family (only the reliably user-resolvable ones — Requestor /
--              Business Owner are Phase-1 text field values, not user refs, so are NOT targeted):
--                gate.opened           → sign-off-requested → the gate's frozen eligible approvers
--                gate.decided          → gate-decided       → the record's watchers (all sides)
--                request.hold-changed  → hold-changed       → the record's watchers (all sides)
--                request.closed        → closed             → the record's watchers (all sides)
--                comment.posted        → mentioned          → payload.mentionedUserIds
--                escalation.opened     → escalation-received→ the AI-Intake group (payload.aiWorkspaceId)
--                announcement.published→ announcement-posted → the announcement's audience (slice 13)
--              Anything else is a no-op. The actor is excluded; disabled accounts are suppressed
--              (BS §6.8). The dedup UNIQUE index + NOT EXISTS guard mean a re-delivered event and a
--              user watching both sides of an escalated record each yield exactly one row (idempotent).
--              Summary is built from RecordId + category only — never raw PII (api-pii-handling.md);
--              the announcement-posted line carries the announcement Title, which is broadcast notice
--              text (Audience Level B/C, §2.7) authored for the audience's bell — not matter content.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_FanOutNotification
    @EventId      UNIQUEIDENTIFIER,
    @EventType    NVARCHAR(64),
    @WorkspaceId  UNIQUEIDENTIFIER,
    @RecordId     NVARCHAR(20),
    @ActorUserId  UNIQUEIDENTIFIER,
    @PayloadJson  NVARCHAR(MAX),
    @EventAt      DATETIME2
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Event   UNIQUEIDENTIFIER = @EventId;
    DECLARE @Type    NVARCHAR(64)     = @EventType;
    DECLARE @Ws      UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Record  NVARCHAR(20)     = @RecordId;
    DECLARE @Actor   UNIQUEIDENTIFIER = @ActorUserId;
    DECLARE @Payload NVARCHAR(MAX)    = @PayloadJson;
    DECLARE @At      DATETIME2        = ISNULL(@EventAt, SYSUTCDATETIME());
    DECLARE @By      NVARCHAR(256)    = N'system';

    -- Set only for announcement.published — the bell deep-link target + title (slice 13).
    DECLARE @AnnId    UNIQUEIDENTIFIER = NULL;
    DECLARE @AnnTitle NVARCHAR(200)    = NULL;

    -- Map event → notification category. A NULL category means "not a notifiable event" → no-op.
    DECLARE @Category NVARCHAR(32) =
        CASE @Type
            WHEN N'gate.opened'            THEN N'sign-off-requested'
            WHEN N'gate.decided'           THEN N'gate-decided'
            WHEN N'request.hold-changed'   THEN N'hold-changed'
            WHEN N'request.closed'         THEN N'closed'
            WHEN N'comment.posted'         THEN N'mentioned'
            WHEN N'escalation.opened'      THEN N'escalation-received'
            WHEN N'announcement.published' THEN N'announcement-posted'
            ELSE NULL
        END;

    IF @Category IS NULL
        RETURN;

    -- Resolve the target user set for this event.
    DECLARE @Targets TABLE (UserId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY);

    IF @Type IN (N'gate.decided', N'request.hold-changed', N'request.closed')
    BEGIN
        -- Watchers of the record on any side — cross-side receivers are deduped below.
        INSERT INTO @Targets (UserId)
        SELECT DISTINCT w.UserId
        FROM dbo.Watchers AS w
        WHERE w.RecordId = @Record
          AND w.UnsubscribedAt IS NULL
          AND w.IsDeleted = 0;
    END
    ELSE IF @Type = N'comment.posted'
    BEGIN
        -- @mention targets carried in the event payload (ids only, resolved API-side at post time).
        INSERT INTO @Targets (UserId)
        SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, mention.[value])
        FROM OPENJSON(@Payload, N'$.mentionedUserIds') AS mention
        WHERE TRY_CONVERT(UNIQUEIDENTIFIER, mention.[value]) IS NOT NULL;
    END
    ELSE IF @Type = N'gate.opened'
    BEGIN
        -- The eligible approvers frozen onto the ApprovalRequest at open (payload.approvalRequestId).
        DECLARE @ApprovalRequestId UNIQUEIDENTIFIER =
            TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(@Payload, N'$.approvalRequestId'));

        INSERT INTO @Targets (UserId)
        SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(member.[value], N'$.userId'))
        FROM dbo.ApprovalRequests AS ar
        CROSS APPLY OPENJSON(ar.FrozenApproverSet) AS slot
        CROSS APPLY OPENJSON(slot.[value], N'$.eligibleMembers') AS member
        WHERE ar.ApprovalRequestId = @ApprovalRequestId
          AND ar.IsDeleted = 0
          AND TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(member.[value], N'$.userId')) IS NOT NULL;
    END
    ELSE IF @Type = N'escalation.opened'
    BEGIN
        -- The AI-Intake group on the AI-side workspace (payload.aiWorkspaceId). Seeded empty in
        -- Phase 1 (members added in slice 17) — the event is handled; the roster is simply empty.
        DECLARE @AiWorkspaceId UNIQUEIDENTIFIER =
            TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(@Payload, N'$.aiWorkspaceId'));

        INSERT INTO @Targets (UserId)
        SELECT DISTINCT gm.UserId
        FROM dbo.UserGroup AS g
        INNER JOIN dbo.UserGroupMembership AS gm
            ON gm.UserGroupId = g.UserGroupId AND gm.IsDeleted = 0
        WHERE g.WorkspaceId = @AiWorkspaceId
          AND g.GroupKey = N'ai-intake'
          AND g.IsDeleted = 0;
    END
    ELSE IF @Type = N'announcement.published'
    BEGIN
        -- The announcement's audience (slice 13). The row is Published in this same transaction, so
        -- its Audience/Title are visible here. Audience never widens access (§10.2): everyone = active
        -- members; named-users = listed ids ∩ members; role-scoped = ApproverTeamMembership for the
        -- listed role labels. A role roster seeded empty fans to zero (slice 8 precedent).
        SET @AnnId = TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(@Payload, N'$.announcementId'));

        DECLARE @Audience NVARCHAR(MAX);
        DECLARE @AnnWs    UNIQUEIDENTIFIER;
        SELECT @Audience = a.Audience, @AnnTitle = a.Title, @AnnWs = a.WorkspaceId
        FROM dbo.Announcements AS a
        WHERE a.AnnouncementId = @AnnId AND a.IsDeleted = 0;

        IF @AnnWs IS NOT NULL
        BEGIN
            DECLARE @Kind NVARCHAR(16) = JSON_VALUE(@Audience, N'$.kind');

            IF @Kind = N'everyone'
            BEGIN
                INSERT INTO @Targets (UserId)
                SELECT DISTINCT m.UserId
                FROM dbo.WorkspaceMembership AS m
                WHERE m.WorkspaceId = @AnnWs AND m.IsDeleted = 0;
            END
            ELSE IF @Kind = N'named-users'
            BEGIN
                INSERT INTO @Targets (UserId)
                SELECT DISTINCT m.UserId
                FROM dbo.WorkspaceMembership AS m
                INNER JOIN OPENJSON(@Audience, N'$.userIds') AS uid
                    ON TRY_CONVERT(UNIQUEIDENTIFIER, uid.[value]) = m.UserId
                WHERE m.WorkspaceId = @AnnWs AND m.IsDeleted = 0;
            END
            ELSE IF @Kind = N'role-scoped'
            BEGIN
                INSERT INTO @Targets (UserId)
                SELECT DISTINCT atm.UserId
                FROM OPENJSON(@Audience, N'$.roleLabels') AS rl
                INNER JOIN dbo.ApproverTeamMembership AS atm
                    ON atm.RoleLabel = rl.[value]
                   AND atm.WorkspaceId = @AnnWs
                   AND atm.IsDeleted = 0
                INNER JOIN dbo.WorkspaceMembership AS m
                    ON m.WorkspaceId = @AnnWs AND m.UserId = atm.UserId AND m.IsDeleted = 0;
            END
        END
    END;

    -- Exclude the actor (never notify yourself) and any disabled account (BS §6.8 — notifications
    -- to disabled accounts are suppressed).
    DELETE FROM @Targets WHERE UserId = @Actor;
    DELETE t
    FROM @Targets AS t
    INNER JOIN dbo.Users AS u ON u.UserId = t.UserId
    WHERE u.IsDisabled = 1 OR u.IsDeleted = 1;

    -- The bell line — RecordId + category only (announcement-posted carries the notice Title).
    DECLARE @Summary NVARCHAR(400) =
        CASE @Category
            WHEN N'sign-off-requested'  THEN N'Your approval is requested on ' + ISNULL(@Record, N'a record')
            WHEN N'gate-decided'        THEN N'A gate decision was recorded on ' + ISNULL(@Record, N'a record')
            WHEN N'hold-changed'        THEN CASE WHEN TRY_CONVERT(BIT, JSON_VALUE(@Payload, N'$.held')) = 1
                                                  THEN ISNULL(@Record, N'A record') + N' was placed on hold'
                                                  ELSE N'Hold cleared on ' + ISNULL(@Record, N'a record') END
            WHEN N'closed'              THEN ISNULL(@Record, N'A record') + N' was closed'
            WHEN N'mentioned'           THEN N'You were mentioned on ' + ISNULL(@Record, N'a record')
            WHEN N'escalation-received' THEN ISNULL(@Record, N'A record') + N' was escalated to AI Solutions'
            WHEN N'announcement-posted' THEN N'New announcement: ' + ISNULL(@AnnTitle, N'(untitled)')
            ELSE N'Update on ' + ISNULL(@Record, N'a record')
        END;

    -- Insert one row per remaining target, skipping any that already exist for this event (dedup).
    -- NotificationId is omitted so the table's NEWSEQUENTIALID() default fires per row — sequential
    -- keys keep the clustered PK from fragmenting under this hot append path (database-performance.md).
    -- AnnouncementId is set only for announcement-posted rows (the bell deep-link to S21).
    INSERT INTO dbo.Notifications
        (UserId, WorkspaceId, RecordId, AnnouncementId, Category, Summary, SourceEventId,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    SELECT
        t.UserId, @Ws, @Record, @AnnId, @Category, @Summary, @Event,
        @At, @At, @By, @By
    FROM @Targets AS t
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.Notifications AS n
        WHERE n.UserId = t.UserId
          AND n.SourceEventId = @Event
          AND n.Category = @Category
          AND ISNULL(n.RecordId, N'') = ISNULL(@Record, N'')
          AND n.IsDeleted = 0);
END;
GO

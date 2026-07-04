-- =============================================
-- Author:      /dev-build-application (Slice 6 — Comments & activity thread)
-- Create Date: 2026-07-04
-- Description: Returns the interleaved activity thread for a record — comments UNION audit
--              events — in chronological order (BS §9.3, §12). Access is baked into each
--              source via a WorkspaceMembership EXISTS on that row's own WorkspaceId, so a
--              caller sees only the side(s) they belong to; a caller with no membership gets
--              ZERO rows and the API answers 403 without disclosing existence (BS §22.6).
--
--              comment.posted / comment.mentioned audit rows are excluded from the event
--              branch — the comment itself is already surfaced as a comment item, so folding
--              in its audit twin would double it. All other event types render as timeline
--              events. Field values / bodies are Confidential and never logged (the caller
--              is entitled to read them here; api-pii-handling.md governs logs, not reads).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetActivityThread
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;

    SELECT
        thread.Kind,
        thread.ItemAt,
        thread.CommentId,
        thread.AuthorUserId,
        thread.Body,
        thread.MentionedUserIds,
        thread.EventType,
        thread.ActorUserId,
        thread.EventPayload
    FROM (
        SELECT
            N'comment'                       AS Kind,
            c.CreatedAt                      AS ItemAt,
            c.CommentId                      AS CommentId,
            c.AuthorUserId                   AS AuthorUserId,
            c.Body                           AS Body,
            c.MentionedUserIds               AS MentionedUserIds,
            CAST(NULL AS NVARCHAR(64))       AS EventType,
            CAST(NULL AS UNIQUEIDENTIFIER)   AS ActorUserId,
            CAST(NULL AS NVARCHAR(MAX))      AS EventPayload
        FROM dbo.Comments AS c
        WHERE c.RecordId = @Record
          AND c.IsDeleted = 0
          AND EXISTS (
              SELECT 1 FROM dbo.WorkspaceMembership AS m
              WHERE m.WorkspaceId = c.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0)

        UNION ALL

        SELECT
            N'event'                         AS Kind,
            a.EventAt                        AS ItemAt,
            CAST(NULL AS UNIQUEIDENTIFIER)   AS CommentId,
            CAST(NULL AS UNIQUEIDENTIFIER)   AS AuthorUserId,
            CAST(NULL AS NVARCHAR(MAX))      AS Body,
            CAST(NULL AS NVARCHAR(MAX))      AS MentionedUserIds,
            a.EventType                      AS EventType,
            a.ActorUserId                    AS ActorUserId,
            a.EventPayload                   AS EventPayload
        FROM dbo.AuditEntry AS a
        WHERE a.RecordId = @Record
          AND a.EventType NOT IN (N'comment.posted', N'comment.mentioned')
          AND EXISTS (
              SELECT 1 FROM dbo.WorkspaceMembership AS m
              WHERE m.WorkspaceId = a.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0)
    ) AS thread
    ORDER BY thread.ItemAt ASC, thread.Kind ASC;
END;
GO

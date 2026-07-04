-- =============================================
-- Author:      /dev-build-application (Slice 6 — Comments & activity thread)
-- Create Date: 2026-07-04
-- Description: Posts one immutable comment on a record, gating write access on the caller's
--              membership of the record's workspace (api-record-access.md — the same access
--              is baked into the query as every read path). A caller who is not a member of
--              the record's workspace inserts ZERO rows and @CommentId returns NULL, so the
--              API answers 403 without disclosing record existence (BS §22.6).
--
--              @MentionedUserIds is a JSON array (or NULL) already parsed API-side. UpdatedAt
--              is set equal to CreatedAt — comments are immutable (BS §9.3). Audit + @mention
--              fan-out are emitted API-side off the event spine (comment.posted / mentioned).
--              Returns the new CommentId via OUTPUT (no result set — the caller re-reads the
--              thread via usp_GetActivityThread).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateComment
    @RecordId         NVARCHAR(20),
    @WorkspaceId      UNIQUEIDENTIFIER,
    @AuthorUserId     UNIQUEIDENTIFIER,
    @Body             NVARCHAR(MAX),
    @MentionedUserIds NVARCHAR(MAX),
    @CommentId        UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record   NVARCHAR(20)     = @RecordId;
    DECLARE @Ws       UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Author   UNIQUEIDENTIFIER = @AuthorUserId;
    DECLARE @BodyLocal NVARCHAR(MAX)   = @Body;
    DECLARE @Mentions NVARCHAR(MAX)    = @MentionedUserIds;
    DECLARE @Now      DATETIME2        = SYSUTCDATETIME();

    SET @CommentId = NULL;

    -- Access gate: the record must exist on a workspace the caller is a member of.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @Author AND m.IsDeleted = 0
        WHERE r.RecordId = @Record
          AND r.WorkspaceId = @Ws
          AND r.IsDeleted = 0)
        RETURN;

    DECLARE @NewId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO dbo.Comments
        (CommentId, RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, MentionedUserIds,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@NewId, @Record, @Ws, N'Request', @Author, @BodyLocal, @Mentions,
         @Now, @Now, CAST(@Author AS NVARCHAR(256)), CAST(@Author AS NVARCHAR(256)));

    SET @CommentId = @NewId;
END;
GO

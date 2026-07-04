-- =============================================
-- Author:      /dev-build-application (Slice 6 — Comments & activity thread)
-- Create Date: 2026-07-04
-- Description: Creates dbo.Comments — immutable, per-record commentary (BS §9.3, data-model.md
--              §Comment). Corrections are new comments; edits and deletes are rejected at every
--              access level by trg_Comments_PreventMutation (the same INSTEAD OF pattern the
--              append-only AuditEntry uses).
--
--              WorkspaceId is stored per-side (like Watcher / AuditEntry) so the activity-thread
--              read can gate access by a WorkspaceMembership join and disambiguate the two rows
--              an escalated record has (slice 9). RecordId has no hard FK — the object type is
--              inferred (Requests today; Features / Announcements later), matching AuditEntry.
--
--              MentionedUserIds is a JSON array parsed at post time for @mention fan-out
--              (the fan-out itself is slice 12; slice 6 only emits the events).
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Comments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Comments
    (
        CommentId        UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Comments_CommentId DEFAULT NEWSEQUENTIALID(),
        RecordId         NVARCHAR(20)     NOT NULL,
        -- Per-side: a comment lives on one workspace's copy of the record (bridge, slice 9).
        WorkspaceId      UNIQUEIDENTIFIER NOT NULL,
        ObjectType       NVARCHAR(16)     NOT NULL CONSTRAINT DF_Comments_ObjectType DEFAULT N'Request',
        AuthorUserId     UNIQUEIDENTIFIER NOT NULL,
        Body             NVARCHAR(MAX)    NOT NULL,
        -- JSON array of mentioned user ids, parsed at post time (BS §11.2). NULL when none.
        MentionedUserIds NVARCHAR(MAX)    NULL,

        -- Audit columns kept for schema consistency; UPDATE/DELETE (incl. soft-delete) are
        -- rejected by trg_Comments_PreventMutation, so these never change post-insert.
        -- UpdatedAt is set equal to CreatedAt on insert (comments are immutable).
        CreatedAt        DATETIME2        NOT NULL CONSTRAINT DF_Comments_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt        DATETIME2        NOT NULL CONSTRAINT DF_Comments_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy        NVARCHAR(256)    NOT NULL,
        UpdatedBy        NVARCHAR(256)    NOT NULL,
        IsDeleted        BIT              NOT NULL CONSTRAINT DF_Comments_IsDeleted DEFAULT 0,
        DeletedAt        DATETIME2        NULL,

        CONSTRAINT PK_Comments PRIMARY KEY CLUSTERED (CommentId),
        CONSTRAINT FK_Comments_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Comments_Users FOREIGN KEY (AuthorUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Comments_Mentions_Json CHECK (MentionedUserIds IS NULL OR ISJSON(MentionedUserIds) = 1)
    );
END;
GO

-- FK index on AuthorUserId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Comments_AuthorUserId' AND object_id = OBJECT_ID(N'dbo.Comments'))
    CREATE NONCLUSTERED INDEX IX_Comments_AuthorUserId ON dbo.Comments (AuthorUserId);
GO

-- FK index on WorkspaceId (used by the access gate on the thread read).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Comments_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Comments'))
    CREATE NONCLUSTERED INDEX IX_Comments_WorkspaceId ON dbo.Comments (WorkspaceId) WHERE IsDeleted = 0;
GO

-- Per-record thread read: comments for a record in chronological order, scoped per side.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Comments_Record_Workspace_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Comments'))
    CREATE NONCLUSTERED INDEX IX_Comments_Record_Workspace_CreatedAt
        ON dbo.Comments (RecordId, WorkspaceId, CreatedAt) WHERE IsDeleted = 0;
GO

-- Immutability guard: comments are never edited or deleted (BS §9.3).
IF OBJECT_ID(N'dbo.trg_Comments_PreventMutation', N'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_Comments_PreventMutation;
GO
CREATE TRIGGER dbo.trg_Comments_PreventMutation
ON dbo.Comments
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- No row is ever changed. Corrections are new comments (BS §9.3).
    THROW 50000, N'dbo.Comments is immutable. UPDATE and DELETE are not permitted.', 1;
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_032_CreateComments')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_032_CreateComments', SUSER_SNAME(), N'Slice 6 — Comments table (immutable).');
END;
GO

-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Creates dbo.Announcements — team notices delivered through the bell (BS §2.7 / §20,
--              data-model.md §Announcement, module-boundaries §9). A light record with a
--              publish/retire lifecycle (no stage machinery) and a two-layer audience
--              (everyone / role-scoped / named-users, §10.2) that never widens access.
--
--              AuthorUserId is the explicit author (the DTO's `author`; the audit CreatedBy string
--              is separate, like Comments.AuthorUserId / Watchers.UserId). Audience is stored as one
--              JSON document ({ kind, roleLabels?, userIds? }) matching AnnouncementAudience in
--              announcements.ts — usp_QueryAnnouncements / usp_FanOutNotification parse it. Status is
--              Draft → Published → Retired; a Published announcement past ExpiresOn is treated as
--              Retired at read time (never hard-deleted, §4.3). Portable (§2.1); seeded in the AI
--              Solutions workspace first. No field crosses the bridge. Idempotent per
--              database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Announcements', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Announcements
    (
        AnnouncementId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Announcements_AnnouncementId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId     UNIQUEIDENTIFIER NOT NULL,
        -- The author (Created by, §20). GUID ref for the DTO + fan-out actor-exclusion.
        AuthorUserId    UNIQUEIDENTIFIER NOT NULL,
        Title           NVARCHAR(200)    NOT NULL,
        -- Rich text; links + light formatting allowed. Stored as-is (sanitised at render, web-coding-standards).
        Body            NVARCHAR(MAX)    NOT NULL,
        -- Two-layer audience as JSON: { kind: 'everyone'|'role-scoped'|'named-users', roleLabels?, userIds? }.
        Audience        NVARCHAR(MAX)    NOT NULL,
        Pinned          BIT              NOT NULL CONSTRAINT DF_Announcements_Pinned DEFAULT 0,
        -- Optional auto-retire date. On/after this date the announcement stops surfacing (§20).
        ExpiresOn       DATE             NULL,
        Status          NVARCHAR(16)     NOT NULL CONSTRAINT DF_Announcements_Status DEFAULT N'Draft',
        -- Set when Status first becomes Published.
        PublishedAt     DATETIME2        NULL,

        CreatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Announcements_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Announcements_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy       NVARCHAR(256)    NOT NULL,
        UpdatedBy       NVARCHAR(256)    NOT NULL,
        IsDeleted       BIT              NOT NULL CONSTRAINT DF_Announcements_IsDeleted DEFAULT 0,
        DeletedAt       DATETIME2        NULL,

        CONSTRAINT PK_Announcements PRIMARY KEY CLUSTERED (AnnouncementId),
        CONSTRAINT FK_Announcements_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Announcements_Users FOREIGN KEY (AuthorUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Announcements_Status CHECK (Status IN (N'Draft', N'Published', N'Retired')),
        CONSTRAINT CK_Announcements_Audience CHECK (ISJSON(Audience) = 1)
    );
END;
GO

-- FK index on WorkspaceId (database-performance.md — every FK column has a non-clustered index).
-- Also drives the audience/membership-scoped list read.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Announcements_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Announcements'))
    CREATE NONCLUSTERED INDEX IX_Announcements_WorkspaceId ON dbo.Announcements (WorkspaceId) WHERE IsDeleted = 0;
GO

-- FK index on AuthorUserId.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Announcements_AuthorUserId' AND object_id = OBJECT_ID(N'dbo.Announcements'))
    CREATE NONCLUSTERED INDEX IX_Announcements_AuthorUserId ON dbo.Announcements (AuthorUserId) WHERE IsDeleted = 0;
GO

-- The manage/browse read: workspace's rows ordered pinned-first then newest. Status INCLUDEd so the
-- list scan stays covering for the common ordering (database-performance.md).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Announcements_Workspace_Pinned_Published' AND object_id = OBJECT_ID(N'dbo.Announcements'))
    CREATE NONCLUSTERED INDEX IX_Announcements_Workspace_Pinned_Published
        ON dbo.Announcements (WorkspaceId, Pinned DESC, PublishedAt DESC)
        INCLUDE (Status) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_042_CreateAnnouncements')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_042_CreateAnnouncements', SUSER_SNAME(), N'Slice 13 — Announcements table (team notices, publish/retire lifecycle).');
END;
GO

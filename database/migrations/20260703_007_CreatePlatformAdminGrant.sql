-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Creates dbo.PlatformAdminGrant — platform-scope, the single source of
--              truth for the additive firm-wide "Platform admin" grant (BS §4.2,
--              §4.3). Not a workspace access level; a user either holds the grant or
--              does not. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.PlatformAdminGrant', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PlatformAdminGrant
    (
        GrantId    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_PlatformAdminGrant_GrantId DEFAULT NEWSEQUENTIALID(),
        UserId     UNIQUEIDENTIFIER NOT NULL,
        GrantedAt  DATETIME2        NOT NULL CONSTRAINT DF_PlatformAdminGrant_GrantedAt DEFAULT SYSUTCDATETIME(),

        CreatedAt  DATETIME2        NOT NULL CONSTRAINT DF_PlatformAdminGrant_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt  DATETIME2        NOT NULL CONSTRAINT DF_PlatformAdminGrant_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy  NVARCHAR(256)    NOT NULL,
        UpdatedBy  NVARCHAR(256)    NOT NULL,
        IsDeleted  BIT              NOT NULL CONSTRAINT DF_PlatformAdminGrant_IsDeleted DEFAULT 0,
        DeletedAt  DATETIME2        NULL,

        CONSTRAINT PK_PlatformAdminGrant PRIMARY KEY CLUSTERED (GrantId),
        CONSTRAINT FK_PlatformAdminGrant_Users FOREIGN KEY (UserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- One active grant per user.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_PlatformAdminGrant_UserId' AND object_id = OBJECT_ID(N'dbo.PlatformAdminGrant'))
    CREATE UNIQUE INDEX UX_PlatformAdminGrant_UserId ON dbo.PlatformAdminGrant (UserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_007_CreatePlatformAdminGrant')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_007_CreatePlatformAdminGrant', SUSER_SNAME(), N'Slice 1 — PlatformAdminGrant table.');
END;
GO

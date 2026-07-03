-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Creates dbo.Users. Rows are provisioned by EnsureUserMiddleware on
--              first authenticated request (BS §4.1, api-auth.md) — slice 2 wires
--              the upsert path. UserId is the Entra `oid` claim (app-supplied, no
--              default) and is the ONLY user identifier permitted in logs
--              (api-logging.md). Idempotent per database-migrations.md.
--
--              PII / Always-Encrypted: DisplayName and Email are PII and must be
--              Always-Encrypted at rest in staging/production (data-model.md,
--              database/CLAUDE.md). Always-Encrypted requires a Column Master Key
--              (Key Vault) + Column Encryption Key that do not exist on a bare
--              LocalDB/dev instance, so this migration creates the columns as plain
--              NVARCHAR. Applying the CEK/CMK and converting these two columns to
--              ENCRYPTED WITH (...) is a documented deploy prerequisite — see
--              scaffold-notes.md / the deployment plan. Do NOT log these columns.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users
    (
        -- Entra `oid` claim. App-supplied; no server default.
        UserId        UNIQUEIDENTIFIER NOT NULL,
        DisplayName   NVARCHAR(200)    NOT NULL,   -- PII (Always-Encrypted in prod). Never logged.
        Email         NVARCHAR(320)    NOT NULL,   -- PII (Always-Encrypted in prod). Never logged.
        LastSignInAt  DATETIME2        NOT NULL,
        -- On deactivation. Notifications to disabled accounts are suppressed (BS §6.8).
        IsDisabled    BIT              NOT NULL CONSTRAINT DF_Users_IsDisabled DEFAULT 0,

        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,
        IsDeleted     BIT              NOT NULL CONSTRAINT DF_Users_IsDeleted DEFAULT 0,
        DeletedAt     DATETIME2        NULL,

        CONSTRAINT PK_Users PRIMARY KEY CLUSTERED (UserId)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_003_CreateUsers')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_003_CreateUsers', SUSER_SNAME(), N'Slice 1 — Users table (PII columns; AE applied at deploy).');
END;
GO

-- =============================================
-- Author:      /dev-build-application (Slice 2 — Auth & app shell)
-- Create Date: 2026-07-03
-- Description: Adds dbo.Users.Theme — the server-persisted UI theme preference
--              ('light' | 'dark'). Roams across devices; the SPA mirrors it to
--              localStorage for the pre-paint theme-init script (web-persistence.md).
--              Non-PII, so no Always-Encrypted handling. NOT NULL with a 'light'
--              default so existing rows and new inserts are always valid.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Users', N'Theme') IS NULL
BEGIN
    ALTER TABLE dbo.Users
        ADD Theme NVARCHAR(10) NOT NULL
            CONSTRAINT DF_Users_Theme DEFAULT N'light';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Users_Theme'
)
AND COL_LENGTH(N'dbo.Users', N'Theme') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Users
        ADD CONSTRAINT CK_Users_Theme CHECK (Theme IN (N'light', N'dark'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_013_AddUserTheme')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_013_AddUserTheme', SUSER_SNAME(), N'Slice 2 — Users.Theme preference column.');
END;
GO

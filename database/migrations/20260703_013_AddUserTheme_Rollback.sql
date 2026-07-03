-- =============================================
-- Author:      /dev-build-application (Slice 2 — Auth & app shell)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_013_AddUserTheme. Drops the CHECK constraint,
--              the default constraint, and the Theme column. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Users_Theme')
BEGIN
    ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Theme;
END;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Users_Theme')
BEGIN
    ALTER TABLE dbo.Users DROP CONSTRAINT DF_Users_Theme;
END;
GO

IF COL_LENGTH(N'dbo.Users', N'Theme') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Users DROP COLUMN Theme;
END;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_013_AddUserTheme';
GO

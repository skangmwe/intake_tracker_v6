-- =============================================
-- Author:      /dev-build-application (Slice 22 — Home surface)
-- Create Date: 2026-07-06
-- Description: Adds dbo.Users.LastHomeSeenAt — the anchor for the Home "Since you were last here"
--              panel (BS §10.7). usp_GetHomeActivity reads the prior value, returns audit activity
--              newer than it, then stamps the column to the current time so the *next* Home load shows
--              only what changed since this one. NULL means "never opened Home" — the first visit falls
--              back to a recent window so a brand-new user still sees context. Distinct from
--              LastSignInAt (refreshed by user provisioning, not per Home visit). Nullable, no default;
--              idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Users', N'LastHomeSeenAt') IS NULL
    ALTER TABLE dbo.Users
        ADD LastHomeSeenAt DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_050_AlterUsers_AddLastHomeSeenAt')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260706_050_AlterUsers_AddLastHomeSeenAt', SUSER_SNAME(), N'Slice 22 — Users.LastHomeSeenAt (Home "Since you were last here" anchor).');
END;
GO

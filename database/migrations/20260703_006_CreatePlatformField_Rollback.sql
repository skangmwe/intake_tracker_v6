-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_006_CreatePlatformField. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.PlatformField', N'U') IS NOT NULL
    DROP TABLE dbo.PlatformField;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_006_CreatePlatformField';
GO

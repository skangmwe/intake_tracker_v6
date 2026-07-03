-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_011_SeedPlatformFields. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DELETE FROM dbo.PlatformField
WHERE FieldKey IN (N'record-id', N'workspace', N'origin', N'created-at', N'updated-at', N'legacy-id', N'ai-solutions-status');
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_011_SeedPlatformFields';
GO

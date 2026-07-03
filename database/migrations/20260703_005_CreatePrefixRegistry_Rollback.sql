-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_005_CreatePrefixRegistry. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.PrefixRegistry', N'U') IS NOT NULL
    DROP TABLE dbo.PrefixRegistry;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_005_CreatePrefixRegistry';
GO

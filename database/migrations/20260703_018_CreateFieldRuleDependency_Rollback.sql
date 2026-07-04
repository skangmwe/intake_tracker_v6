-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_018_CreateFieldRuleDependency. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.FieldRuleDependency', N'U') IS NOT NULL
    DROP TABLE dbo.FieldRuleDependency;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_018_CreateFieldRuleDependency';
GO

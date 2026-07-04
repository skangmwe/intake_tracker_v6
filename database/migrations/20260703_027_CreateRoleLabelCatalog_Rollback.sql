-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_027_CreateRoleLabelCatalog. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.RoleLabelCatalog', N'U') IS NOT NULL DROP TABLE dbo.RoleLabelCatalog;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_027_CreateRoleLabelCatalog';
GO

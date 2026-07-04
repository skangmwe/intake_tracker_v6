-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_014_CreateFieldDefinition. Idempotent.
--              Drops the child tables (SelectOption / FieldRule / DerivedField /
--              FieldRuleDependency) first if present, so the FK-referenced parent
--              can drop cleanly when rollbacks run out of order.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.FieldRuleDependency', N'U') IS NOT NULL DROP TABLE dbo.FieldRuleDependency;
IF OBJECT_ID(N'dbo.DerivedField', N'U') IS NOT NULL DROP TABLE dbo.DerivedField;
IF OBJECT_ID(N'dbo.FieldRule', N'U') IS NOT NULL DROP TABLE dbo.FieldRule;
IF OBJECT_ID(N'dbo.SelectOption', N'U') IS NOT NULL DROP TABLE dbo.SelectOption;
IF OBJECT_ID(N'dbo.FieldDefinition', N'U') IS NOT NULL DROP TABLE dbo.FieldDefinition;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_014_CreateFieldDefinition';
GO

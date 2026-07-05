-- =============================================
-- Author:      /dev-build-application (Slice 10 — Closure, Copy, Re-pursuit + Typed links)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_038_CreateTypedLinks. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.TypedLinks', N'U') IS NOT NULL
    DROP TABLE dbo.TypedLinks;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_038_CreateTypedLinks';
GO

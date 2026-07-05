-- =============================================
-- Author:      /dev-build-application (Slice 11 — Attachments)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_039_CreateAttachments. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Attachments', N'U') IS NOT NULL
    DROP TABLE dbo.Attachments;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_039_CreateAttachments';
GO

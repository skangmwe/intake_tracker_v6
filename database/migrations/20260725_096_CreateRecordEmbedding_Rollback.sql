-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 2 retrieval)
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_096 — drops dbo.RecordEmbedding (indexes go with the table). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.RecordEmbedding', N'U') IS NOT NULL
    DROP TABLE dbo.RecordEmbedding;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_096_CreateRecordEmbedding';
GO

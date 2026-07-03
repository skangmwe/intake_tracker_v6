-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_009_CreateAuditEntry. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.trg_AuditEntry_PreventMutation', N'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_AuditEntry_PreventMutation;
GO

IF OBJECT_ID(N'dbo.AuditEntry', N'U') IS NOT NULL
    DROP TABLE dbo.AuditEntry;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_009_CreateAuditEntry';
GO

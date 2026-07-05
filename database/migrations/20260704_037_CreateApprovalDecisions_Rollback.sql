-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_037_CreateApprovalDecisions. Drops dbo.ApprovalDecisions and
--              its indexes. Run BEFORE the 036 (ApprovalRequests) rollback — ApprovalDecisions FKs
--              to ApprovalRequests. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ApprovalDecisions', N'U') IS NOT NULL
    DROP TABLE dbo.ApprovalDecisions;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_037_CreateApprovalDecisions';
GO

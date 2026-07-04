-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_026_CreateApproverTeamMembership. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ApproverTeamMembership', N'U') IS NOT NULL DROP TABLE dbo.ApproverTeamMembership;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_026_CreateApproverTeamMembership';
GO

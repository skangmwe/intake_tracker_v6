-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: DATA migration. Seeds the "AI Intake" user group on the AI Solutions
--              workspace — the group notified when a Request is escalated (BS §6).
--              Members are added as users are provisioned / assigned (later slices);
--              the group itself is seeded here. Idempotent (guarded by GroupKey).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @AiWorkspaceId UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001';
DECLARE @AiIntakeId    UNIQUEIDENTIFIER = N'1A1EA150-0000-4000-8000-000000000001';
DECLARE @Seed          NVARCHAR(256)    = N'system-seed';

BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM dbo.UserGroup WHERE WorkspaceId = @AiWorkspaceId AND GroupKey = N'ai-intake' AND IsDeleted = 0)
        INSERT INTO dbo.UserGroup (UserGroupId, WorkspaceId, Name, GroupKey, CreatedBy, UpdatedBy)
        VALUES (@AiIntakeId, @AiWorkspaceId, N'AI Intake', N'ai-intake', @Seed, @Seed);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_012_SeedAiIntakeUserGroup')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260703_012_SeedAiIntakeUserGroup', SUSER_SNAME(), N'Slice 1 — seed AI Intake user group.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

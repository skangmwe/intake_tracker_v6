-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_028_SeedAiSolutionsLifecycle. Removes the seeded
--              slots, gates, stages, lifecycle, and role labels by their fixed identifiers.
--              Idempotent. Does not touch admin-created rows.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Lc    UNIQUEIDENTIFIER = N'11FE0000-0000-4000-8000-000000000001';
DECLARE @GQa   UNIQUEIDENTIFIER = N'6A7E0000-0000-4000-8000-000000000001';
DECLARE @GPost UNIQUEIDENTIFIER = N'6A7E0000-0000-4000-8000-000000000002';

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.GateApproverSlot', N'U') IS NOT NULL
        DELETE FROM dbo.GateApproverSlot WHERE GateDefinitionId IN (@GQa, @GPost);

    IF OBJECT_ID(N'dbo.GateDefinition', N'U') IS NOT NULL
        DELETE FROM dbo.GateDefinition WHERE GateDefinitionId IN (@GQa, @GPost);

    IF OBJECT_ID(N'dbo.StageDefinition', N'U') IS NOT NULL
        DELETE FROM dbo.StageDefinition WHERE LifecycleId = @Lc;

    IF OBJECT_ID(N'dbo.Lifecycle', N'U') IS NOT NULL
        DELETE FROM dbo.Lifecycle WHERE LifecycleId = @Lc;

    IF OBJECT_ID(N'dbo.RoleLabelCatalog', N'U') IS NOT NULL
        DELETE FROM dbo.RoleLabelCatalog
        WHERE Label IN (N'AI Solutions Manager', N'GCO', N'InfoSec', N'PG/Dept Lead', N'Data Privacy');

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_028_SeedAiSolutionsLifecycle';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

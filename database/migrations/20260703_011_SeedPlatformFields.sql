-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: DATA migration. Seeds the platform-defined field catalog (BS §17.1):
--              the system ID/timestamp fields, Origin (system-computed), Legacy ID
--              (CSV migration), and AI Solutions Status. AI Solutions Status has NO
--              manual write path (HasManualWritePath = 0) — the bridge writes it off
--              the event spine (BS §6.4). Its Select option set is NOT invented here;
--              it is populated with the six-stage lifecycle seed in slice 4, so
--              SelectOptionsJson is left NULL. Idempotent (guarded by FieldKey).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';

-- (FieldKey, DisplayName, FieldType, Category, IsSystemImmutable, HasManualWritePath)
DECLARE @Fields TABLE
(
    FieldKey           NVARCHAR(64),
    DisplayName        NVARCHAR(200),
    FieldType          NVARCHAR(32),
    Category           NVARCHAR(32),
    IsSystemImmutable  BIT,
    HasManualWritePath BIT
);

INSERT INTO @Fields (FieldKey, DisplayName, FieldType, Category, IsSystemImmutable, HasManualWritePath)
VALUES
    (N'record-id',           N'Record ID',           N'Text',     N'System',  1, 0),
    (N'workspace',           N'Workspace',           N'Lookup',   N'System',  1, 0),
    (N'origin',              N'Origin',              N'Lookup',   N'Derived', 1, 0),
    (N'created-at',          N'Created At',          N'DateTime', N'System',  1, 0),
    (N'updated-at',          N'Updated At',          N'DateTime', N'System',  1, 0),
    (N'legacy-id',           N'Legacy ID',           N'Text',     N'Platform', 0, 1),
    (N'ai-solutions-status', N'AI Solutions Status', N'Select',   N'Platform', 0, 0);

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.PlatformField
        (FieldKey, DisplayName, FieldType, Category, IsSystemImmutable, HasManualWritePath, SelectOptionsJson, CreatedBy, UpdatedBy)
    SELECT f.FieldKey, f.DisplayName, f.FieldType, f.Category, f.IsSystemImmutable, f.HasManualWritePath, NULL, @Seed, @Seed
    FROM @Fields f
    WHERE NOT EXISTS (SELECT 1 FROM dbo.PlatformField p WHERE p.FieldKey = f.FieldKey AND p.IsDeleted = 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_011_SeedPlatformFields')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260703_011_SeedPlatformFields', SUSER_SNAME(), N'Slice 1 — seed platform-defined fields.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

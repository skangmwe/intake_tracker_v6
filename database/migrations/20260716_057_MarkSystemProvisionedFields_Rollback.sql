-- =============================================
-- Author:      /dev-build-application (Slice 25)
-- Create Date: 2026-07-16
-- Description: Rollback for 20260716_057_MarkSystemProvisionedFields. Clears the
--              IsSystemProvisioned flag on the rows the forward migration set. Does
--              NOT restore IsReadOnly — 'name' was created IsReadOnly=0 in Slice 3, but
--              admins may have edited it since. Leaving IsReadOnly untouched is the
--              safe path (idempotent, no data loss).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.FieldDefinition
   SET IsSystemProvisioned = 0,
       UpdatedAt           = SYSUTCDATETIME(),
       UpdatedBy           = N'system-seed-rollback'
 WHERE FieldKey            = N'name'
   AND ObjectType         IN (N'Request', N'Task', N'Feature')
   AND IsSystemProvisioned = 1;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_057_MarkSystemProvisionedFields')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_057_MarkSystemProvisionedFields';
GO

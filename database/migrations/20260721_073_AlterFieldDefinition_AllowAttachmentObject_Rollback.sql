-- =============================================
-- Author:      /dev-build-application (Slice — Fields tab reconciliation)
-- Create Date: 2026-07-21
-- Description: Rollback for 20260721_073 — narrows the ObjectType CHECK back to the pre-slice
--              set (Request, Task, Feature, ToolkitItem). Soft-deletes any Attachment field
--              rows first so the rebuilt constraint cannot fail validation. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Retire Attachment field rows so the narrowed CHECK validates. Soft delete keeps history.
UPDATE dbo.FieldDefinition
   SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME(), UpdatedBy = N'system-rollback'
 WHERE ObjectType = N'Attachment' AND IsDeleted = 0;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
      AND definition LIKE N'%Attachment%'
)
BEGIN
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT CK_FieldDefinition_ObjectType;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
BEGIN
    ALTER TABLE dbo.FieldDefinition
        ADD CONSTRAINT CK_FieldDefinition_ObjectType
        CHECK (ObjectType IN (N'Request', N'Task', N'Feature', N'ToolkitItem'));
END;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_073_AlterFieldDefinition_AllowAttachmentObject';
GO

-- =============================================
-- Author:      /dev-build-application (Slice — Fields tab reconciliation)
-- Create Date: 2026-07-21
-- Description: Widens the dbo.FieldDefinition.ObjectType CHECK to accept 'Attachment', so the
--              reconciled S30 New Field flow can create custom fields on every built-in object
--              (the picker lists all five: Request, Task, Attachment, Feature, Toolkit item).
--              'ToolkitItem' was already added by migration 056; this adds the last one,
--              'Attachment'. A safe additive change — no existing row carries the new value.
--
--              Drop-then-create is the only path for a table CHECK change; the constraint name
--              is stable, so the rebuild only runs when the current definition lacks
--              'Attachment' (idempotent).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
      AND definition NOT LIKE N'%Attachment%'
)
BEGIN
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT CK_FieldDefinition_ObjectType;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
BEGIN
    ALTER TABLE dbo.FieldDefinition
        ADD CONSTRAINT CK_FieldDefinition_ObjectType
        CHECK (ObjectType IN (N'Request', N'Task', N'Feature', N'ToolkitItem', N'Attachment'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_073_AlterFieldDefinition_AllowAttachmentObject')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260721_073_AlterFieldDefinition_AllowAttachmentObject', SUSER_SNAME(),
            N'Fields tab reconciliation — widen FieldDefinition.ObjectType CHECK to include Attachment.');
END;
GO

-- =============================================
-- Author:      /dev-build-application (Slice 25 — Object-level Relationships)
-- Create Date: 2026-07-16
-- Description: Extends dbo.FieldDefinition with the Slice 25 columns
--              (v2-reconciliation.md §Model deltas 2) and widens the ObjectType CHECK
--              to include ToolkitItem so Slice 29's Toolkit object registers cleanly
--              (a safe additive change — no existing rows carry the new value).
--
--              New columns:
--                IsSystemProvisioned  — marks Record ID / Name / Date created / Last updated /
--                                       Created by as read-only, uncreatable, undeletable rows
--                                       surfaced under a locked band on the Fields tab.
--                TargetObjectType     — the object a RecordReference (Link-to-record) field
--                                       points at. NULL for non-RecordReference field types.
--                AllowMultiple        — a RecordReference field allows N target rows when 1
--                                       (ManyToMany's link column on either side). NULL for
--                                       non-RecordReference.
--                ReverseLinkLabel     — optional label on the reverse side of a
--                                       RecordReference; NULL when the paired side uses its
--                                       own FieldDefinition.
--                RelationshipId       — FK to Relationships when this row was auto-provisioned
--                                       by usp_UpsertRelationship. NULL for manually-created
--                                       Link-to-record fields.
--
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Add the five new columns if absent.
IF COL_LENGTH(N'dbo.FieldDefinition', N'IsSystemProvisioned') IS NULL
    ALTER TABLE dbo.FieldDefinition
        ADD IsSystemProvisioned BIT NOT NULL CONSTRAINT DF_FieldDefinition_IsSystemProvisioned DEFAULT 0;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'TargetObjectType') IS NULL
    ALTER TABLE dbo.FieldDefinition
        ADD TargetObjectType NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'AllowMultiple') IS NULL
    ALTER TABLE dbo.FieldDefinition
        ADD AllowMultiple BIT NULL;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'ReverseLinkLabel') IS NULL
    ALTER TABLE dbo.FieldDefinition
        ADD ReverseLinkLabel NVARCHAR(80) NULL;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'RelationshipId') IS NULL
    ALTER TABLE dbo.FieldDefinition
        ADD RelationshipId UNIQUEIDENTIFIER NULL;
GO

-- 2. Widen the ObjectType CHECK constraint to accept 'ToolkitItem'. Drop-then-create is the
--    only path for a table-check constraint change; the constraint name is stable so this is
--    idempotent (we only rebuild it when the current definition lacks 'ToolkitItem').
IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
      AND definition NOT LIKE N'%ToolkitItem%'
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
        CHECK (ObjectType IN (N'Request', N'Task', N'Feature', N'ToolkitItem'));
END;
GO

-- 3. TargetObjectType is only valid for RecordReference field type.
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_TargetObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
BEGIN
    ALTER TABLE dbo.FieldDefinition
        ADD CONSTRAINT CK_FieldDefinition_TargetObjectType
        CHECK (
            TargetObjectType IS NULL
            OR (FieldType = N'RecordReference' AND TargetObjectType IN (N'Request', N'Task', N'Feature', N'ToolkitItem'))
        );
END;
GO

-- 4. AllowMultiple only valid on RecordReference fields.
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_AllowMultiple'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
BEGIN
    ALTER TABLE dbo.FieldDefinition
        ADD CONSTRAINT CK_FieldDefinition_AllowMultiple
        CHECK (AllowMultiple IS NULL OR FieldType = N'RecordReference');
END;
GO

-- 5. RelationshipId FK — nullable so manually-authored RecordReference fields keep NULL.
--    ON DELETE NO ACTION (retire is soft on Relationships anyway; a hard drop is impossible via app).
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_FieldDefinition_Relationship'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
BEGIN
    ALTER TABLE dbo.FieldDefinition
        ADD CONSTRAINT FK_FieldDefinition_Relationship
        FOREIGN KEY (RelationshipId)
        REFERENCES dbo.Relationships (RelationshipId)
        ON DELETE NO ACTION ON UPDATE NO ACTION;
END;
GO

-- 6. FK-column index (database-performance.md).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_RelationshipId' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE NONCLUSTERED INDEX IX_FieldDefinition_RelationshipId
        ON dbo.FieldDefinition (RelationshipId)
        WHERE RelationshipId IS NOT NULL AND IsDeleted = 0;
GO

-- 7. Filtered index over system-provisioned rows so the Fields tab renders the locked band fast.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_SystemProvisioned' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE NONCLUSTERED INDEX IX_FieldDefinition_SystemProvisioned
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, SortOrder)
        INCLUDE (FieldKey, DisplayName, FieldType, Category)
        WHERE IsSystemProvisioned = 1 AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_056_AlterFieldDefinition_AddLinkToRecordConfig')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260716_056_AlterFieldDefinition_AddLinkToRecordConfig', SUSER_SNAME(),
            N'Slice 25 — FieldDefinition: IsSystemProvisioned + Link-to-record config columns + ToolkitItem CHECK.');
END;
GO

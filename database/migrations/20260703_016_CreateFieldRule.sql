-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Creates dbo.FieldRule — a condition-engine rule attached to a field
--              (BS §3.1). Action is Show / Hide / Require / ProduceValue. The
--              condition reads WhenFieldKey via Comparator against CompareValue
--              (Phase 1 = literals only; current-date / current-user references are
--              Phase 2, §3.1). ProduceValue rules (first-match-wins by SortOrder) are
--              the Derived-category mechanism (§3.4). FieldDefinitionId is the field
--              the rule ACTS ON (the target). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.FieldRule', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FieldRule
    (
        FieldRuleId          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_FieldRule_FieldRuleId DEFAULT NEWSEQUENTIALID(),
        -- The field the rule acts on (shows/hides/requires it, or produces its value).
        FieldDefinitionId    UNIQUEIDENTIFIER NOT NULL,
        -- 'Show' | 'Hide' | 'Require' | 'ProduceValue' (§3.1).
        [Action]             NVARCHAR(16)     NOT NULL,
        -- The field the condition reads (the source of the comparison).
        WhenFieldKey         NVARCHAR(64)     NOT NULL,
        -- 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'isSet' | 'isNotSet' | 'contains'.
        Comparator           NVARCHAR(16)     NOT NULL,
        -- Literal comparison value (Phase 1). NULL for isSet / isNotSet.
        CompareValue         NVARCHAR(400)    NULL,
        -- The label produced by a ProduceValue (Derived-category) rule.
        ProduceValue         NVARCHAR(400)    NULL,
        -- Ordered when->then evaluation order (first match wins for Derived-category).
        SortOrder            INT              NOT NULL CONSTRAINT DF_FieldRule_SortOrder DEFAULT 0,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_FieldRule_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_FieldRule_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_FieldRule_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_FieldRule PRIMARY KEY CLUSTERED (FieldRuleId),
        CONSTRAINT FK_FieldRule_FieldDefinition FOREIGN KEY (FieldDefinitionId)
            REFERENCES dbo.FieldDefinition (FieldDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_FieldRule_Action CHECK ([Action] IN (N'Show', N'Hide', N'Require', N'ProduceValue')),
        CONSTRAINT CK_FieldRule_Comparator CHECK (Comparator IN (
            N'eq', N'neq', N'gt', N'gte', N'lt', N'lte', N'isSet', N'isNotSet', N'contains'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRule_FieldDefinitionId' AND object_id = OBJECT_ID(N'dbo.FieldRule'))
    CREATE NONCLUSTERED INDEX IX_FieldRule_FieldDefinitionId ON dbo.FieldRule (FieldDefinitionId);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_016_CreateFieldRule')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_016_CreateFieldRule', SUSER_SNAME(), N'Slice 3 — FieldRule table.');
END;
GO

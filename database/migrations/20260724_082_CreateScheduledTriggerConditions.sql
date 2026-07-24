-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: The ScheduledTriggerCondition table — the ANDed "when" rows for an 'Authored' trigger,
--              mirroring the FieldRule persistence shape (design spec §3.3). Each row is one
--              field + comparator + value clause the ConditionEngine evaluates. Built-in Kinds
--              (TaskOverdue / ApprovalOverdue) carry no condition rows — their condition is fixed in code.
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'ScheduledTriggerCondition' AND schema_id = SCHEMA_ID(N'dbo'))
BEGIN
    CREATE TABLE dbo.ScheduledTriggerCondition
    (
        ConditionId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ScheduledTriggerCondition_ConditionId DEFAULT NEWSEQUENTIALID(),
        TriggerId     UNIQUEIDENTIFIER NOT NULL,
        -- The field the clause reads (a field key on the trigger's ObjectType), e.g. 'dueDate'.
        WhenFieldKey  NVARCHAR(128)    NOT NULL,
        -- One of the ConditionEngine comparators: isSet/isNotSet/eq/neq/contains/gt/gte/lt/lte.
        Comparator    NVARCHAR(32)     NOT NULL,
        -- The compare-side literal or token (e.g. '@today'); NULL for isSet/isNotSet.
        CompareValue  NVARCHAR(MAX)    NULL,
        SortOrder     INT              NOT NULL CONSTRAINT DF_ScheduledTriggerCondition_SortOrder DEFAULT 0,

        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTriggerCondition_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt     DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTriggerCondition_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,
        IsDeleted     BIT              NOT NULL CONSTRAINT DF_ScheduledTriggerCondition_IsDeleted DEFAULT 0,
        DeletedAt     DATETIME2        NULL,

        CONSTRAINT PK_ScheduledTriggerCondition PRIMARY KEY CLUSTERED (ConditionId),
        CONSTRAINT FK_ScheduledTriggerCondition_ScheduledTrigger FOREIGN KEY (TriggerId)
            REFERENCES dbo.ScheduledTrigger (TriggerId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- FK index on TriggerId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ScheduledTriggerCondition_TriggerId' AND object_id = OBJECT_ID(N'dbo.ScheduledTriggerCondition'))
    CREATE NONCLUSTERED INDEX IX_ScheduledTriggerCondition_TriggerId ON dbo.ScheduledTriggerCondition (TriggerId) WHERE IsDeleted = 0;
GO

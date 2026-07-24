-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: The ScheduledTriggerFire watermark table (design spec §3.3). One row per
--              (trigger, record) recording the date it last fired. Drives fire-once vs re-nag:
--                Once             → row present blocks any re-fire forever.
--                RepeatEveryNDays → re-fire when LastFiredDate + RepeatIntervalDays <= today.
--              RecordId is NVARCHAR(64) — wide enough for a Request record id (PREFIX-NNNNNNNN) or a
--              Task / ApprovalRequest GUID key used by the built-in trigger types.
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'ScheduledTriggerFire' AND schema_id = SCHEMA_ID(N'dbo'))
BEGIN
    CREATE TABLE dbo.ScheduledTriggerFire
    (
        FireId         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ScheduledTriggerFire_FireId DEFAULT NEWSEQUENTIALID(),
        TriggerId      UNIQUEIDENTIFIER NOT NULL,
        RecordId       NVARCHAR(64)     NOT NULL,
        LastFiredDate  DATE             NOT NULL,

        CreatedAt      DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTriggerFire_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt      DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTriggerFire_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy      NVARCHAR(256)    NOT NULL,
        UpdatedBy      NVARCHAR(256)    NOT NULL,
        IsDeleted      BIT              NOT NULL CONSTRAINT DF_ScheduledTriggerFire_IsDeleted DEFAULT 0,
        DeletedAt      DATETIME2        NULL,

        CONSTRAINT PK_ScheduledTriggerFire PRIMARY KEY CLUSTERED (FireId),
        CONSTRAINT FK_ScheduledTriggerFire_ScheduledTrigger FOREIGN KEY (TriggerId)
            REFERENCES dbo.ScheduledTrigger (TriggerId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- One live watermark per (trigger, record). Filtered so a soft-deleted row does not block a fresh one.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ScheduledTriggerFire_TriggerRecord' AND object_id = OBJECT_ID(N'dbo.ScheduledTriggerFire'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ScheduledTriggerFire_TriggerRecord
        ON dbo.ScheduledTriggerFire (TriggerId, RecordId) WHERE IsDeleted = 0;
GO

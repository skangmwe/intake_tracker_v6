-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Creates dbo.PlatformField — platform-scope catalog of system fields,
--              the Legacy ID field, and the AI Solutions Status field (BS §4.3,
--              §17.1). System fields are immutable to everyone including Platform
--              admins. AI Solutions Status has NO manual write path anywhere
--              (HasManualWritePath = 0) — it is written only by the bridge off the
--              event spine (BS §6.4). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.PlatformField', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PlatformField
    (
        PlatformFieldId    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_PlatformField_PlatformFieldId DEFAULT NEWSEQUENTIALID(),
        -- Stable machine key, e.g. 'record-id', 'ai-solutions-status', 'legacy-id'.
        FieldKey           NVARCHAR(64)     NOT NULL,
        DisplayName        NVARCHAR(200)    NOT NULL,
        -- 'Text' | 'Select' | 'DateTime' | 'Lookup' | 'Number' | etc.
        FieldType          NVARCHAR(32)     NOT NULL,
        -- 'System' | 'Platform' | 'Derived'
        Category           NVARCHAR(32)     NOT NULL,
        -- System fields are immutable to everyone (data-model.md universal rule).
        IsSystemImmutable  BIT              NOT NULL CONSTRAINT DF_PlatformField_IsSystemImmutable DEFAULT 0,
        -- AI Solutions Status = 0: no manual write path at any access level (BS §6.4).
        HasManualWritePath BIT              NOT NULL CONSTRAINT DF_PlatformField_HasManualWritePath DEFAULT 1,
        -- JSON array of option values when FieldType = 'Select' (e.g. AI Solutions Status options).
        SelectOptionsJson  NVARCHAR(MAX)    NULL,

        CreatedAt          DATETIME2        NOT NULL CONSTRAINT DF_PlatformField_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt          DATETIME2        NOT NULL CONSTRAINT DF_PlatformField_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy          NVARCHAR(256)    NOT NULL,
        UpdatedBy          NVARCHAR(256)    NOT NULL,
        IsDeleted          BIT              NOT NULL CONSTRAINT DF_PlatformField_IsDeleted DEFAULT 0,
        DeletedAt          DATETIME2        NULL,

        CONSTRAINT PK_PlatformField PRIMARY KEY CLUSTERED (PlatformFieldId),
        CONSTRAINT CK_PlatformField_Category CHECK (Category IN (N'System', N'Platform', N'Derived'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_PlatformField_FieldKey' AND object_id = OBJECT_ID(N'dbo.PlatformField'))
    CREATE UNIQUE INDEX UX_PlatformField_FieldKey ON dbo.PlatformField (FieldKey) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_006_CreatePlatformField')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_006_CreatePlatformField', SUSER_SNAME(), N'Slice 1 — PlatformField table.');
END;
GO

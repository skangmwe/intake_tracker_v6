-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Creates dbo.SelectOption — the option set for a Single-/Multi-select
--              FieldDefinition (BS §2.3). One row per option value, ordered by
--              SortOrder. The Stage field's options are NOT stored here — they are
--              sourced from StageDefinition (slice 4), which is the lifecycle source
--              of truth. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SelectOption', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SelectOption
    (
        SelectOptionId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_SelectOption_SelectOptionId DEFAULT NEWSEQUENTIALID(),
        FieldDefinitionId    UNIQUEIDENTIFIER NOT NULL,
        -- The stored value (what a record holds); OptionLabel is what the UI shows.
        OptionValue          NVARCHAR(200)    NOT NULL,
        OptionLabel          NVARCHAR(200)    NOT NULL,
        SortOrder            INT              NOT NULL CONSTRAINT DF_SelectOption_SortOrder DEFAULT 0,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_SelectOption_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_SelectOption_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_SelectOption_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_SelectOption PRIMARY KEY CLUSTERED (SelectOptionId),
        CONSTRAINT FK_SelectOption_FieldDefinition FOREIGN KEY (FieldDefinitionId)
            REFERENCES dbo.FieldDefinition (FieldDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SelectOption_FieldDefinitionId' AND object_id = OBJECT_ID(N'dbo.SelectOption'))
    CREATE NONCLUSTERED INDEX IX_SelectOption_FieldDefinitionId ON dbo.SelectOption (FieldDefinitionId);
GO

-- One active value per field.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SelectOption_Field_Value' AND object_id = OBJECT_ID(N'dbo.SelectOption'))
    CREATE UNIQUE INDEX UX_SelectOption_Field_Value ON dbo.SelectOption (FieldDefinitionId, OptionValue) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_015_CreateSelectOption')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_015_CreateSelectOption', SUSER_SNAME(), N'Slice 3 — SelectOption table.');
END;
GO

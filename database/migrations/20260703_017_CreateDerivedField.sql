-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Creates dbo.DerivedField — the configuration header for a derived field
--              (BS §3.3 Calculation, §3.4 Derived-category). Kind = 'Calculation'
--              carries a numeric Expression (e.g. Business Value + Efficiency Gain -
--              Level of Effort). Kind = 'DerivedCategory' carries an optional
--              DefaultValue; its ordered when->then rules live in dbo.FieldRule
--              (Action = 'ProduceValue'). One header per derived FieldDefinition.
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.DerivedField', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DerivedField
    (
        DerivedFieldId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_DerivedField_DerivedFieldId DEFAULT NEWSEQUENTIALID(),
        -- The FieldDefinition that IS derived (FieldType = Calculation or DerivedCategory).
        FieldDefinitionId    UNIQUEIDENTIFIER NOT NULL,
        -- 'Calculation' | 'DerivedCategory'.
        Kind                 NVARCHAR(16)     NOT NULL,
        -- Numeric expression for a Calculation field; NULL for DerivedCategory.
        Expression           NVARCHAR(1000)   NULL,
        -- Optional default/else label for a DerivedCategory field; NULL for Calculation.
        DefaultValue         NVARCHAR(400)    NULL,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_DerivedField_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_DerivedField_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_DerivedField_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_DerivedField PRIMARY KEY CLUSTERED (DerivedFieldId),
        CONSTRAINT FK_DerivedField_FieldDefinition FOREIGN KEY (FieldDefinitionId)
            REFERENCES dbo.FieldDefinition (FieldDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_DerivedField_Kind CHECK (Kind IN (N'Calculation', N'DerivedCategory'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DerivedField_FieldDefinitionId' AND object_id = OBJECT_ID(N'dbo.DerivedField'))
    CREATE NONCLUSTERED INDEX IX_DerivedField_FieldDefinitionId ON dbo.DerivedField (FieldDefinitionId);
GO

-- One active derived-config header per field.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_DerivedField_Field' AND object_id = OBJECT_ID(N'dbo.DerivedField'))
    CREATE UNIQUE INDEX UX_DerivedField_Field ON dbo.DerivedField (FieldDefinitionId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_017_CreateDerivedField')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_017_CreateDerivedField', SUSER_SNAME(), N'Slice 3 — DerivedField table.');
END;
GO

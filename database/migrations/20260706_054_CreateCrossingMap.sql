-- =============================================
-- Author:      /dev-build-application (Slice 24 — admin-editable crossing map, S35)
-- Create Date: 2026-07-06
-- Description: Creates dbo.CrossingMap — the durable PG→AI field-mapping table behind the S35
--              propose / confirm workflow (BS §6.2, data-model.md §CrossingMap). Phase 1's crossing
--              map was read-only, derived from FieldDefinition (Category='Crossing' + CrossingToFieldKey);
--              this table adds admin-authored mappings on top. usp_GetCrossingMap UNIONs the seeded
--              (immutable) pairs with these durable rows.
--
--              A mapping is a 1:1 pair of a PG/Dept-side field and an AI-Solutions field, plus an
--              optional option-correspondence map (JSON: PG option value -> AI option value) for
--              select types. Type-compatibility is validated at propose/confirm (usp_ProposeCrossingMap).
--              Forward-only: a mapping affects future escalations only. Status: 'Proposed' (created by
--              a Platform admin) -> 'Confirmed' (by a Platform admin or the AI-Solutions workspace admin).
--              CreatedBy/CreatedAt ARE the "proposed by / at" audit; ConfirmedByUserId/ConfirmedAt are
--              stamped at confirm. One-to-one is enforced by unique-filtered indexes on each side.
--              Soft-deleted (retire a mapping) by default; idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.CrossingMap', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CrossingMap
    (
        CrossingMapId            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CrossingMap_CrossingMapId DEFAULT NEWSEQUENTIALID(),
        -- The PG/Dept-side source field and the AI-Solutions target field (both FieldDefinition rows).
        PgFieldDefinitionId      UNIQUEIDENTIFIER NOT NULL,
        AiFieldDefinitionId      UNIQUEIDENTIFIER NOT NULL,
        -- Select-type option map: { "pgOptionValue": "aiOptionValue", ... }. NULL for non-select or same-valued.
        OptionCorrespondenceJson NVARCHAR(MAX)    NULL,
        -- Proposed | Confirmed. A mapping is live (crosses on escalation) only once Confirmed.
        Status                   NVARCHAR(16)     NOT NULL CONSTRAINT DF_CrossingMap_Status DEFAULT N'Proposed',
        ConfirmedByUserId        NVARCHAR(256)    NULL,
        ConfirmedAt              DATETIME2        NULL,

        CreatedAt                DATETIME2        NOT NULL CONSTRAINT DF_CrossingMap_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt                DATETIME2        NOT NULL CONSTRAINT DF_CrossingMap_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy                NVARCHAR(256)    NOT NULL,
        UpdatedBy                NVARCHAR(256)    NOT NULL,
        IsDeleted                BIT              NOT NULL CONSTRAINT DF_CrossingMap_IsDeleted DEFAULT 0,
        DeletedAt                DATETIME2        NULL,

        CONSTRAINT PK_CrossingMap PRIMARY KEY CLUSTERED (CrossingMapId),
        CONSTRAINT FK_CrossingMap_PgField FOREIGN KEY (PgFieldDefinitionId)
            REFERENCES dbo.FieldDefinition (FieldDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_CrossingMap_AiField FOREIGN KEY (AiFieldDefinitionId)
            REFERENCES dbo.FieldDefinition (FieldDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_CrossingMap_Status CHECK (Status IN (N'Proposed', N'Confirmed')),
        CONSTRAINT CK_CrossingMap_Option_Json CHECK (OptionCorrespondenceJson IS NULL OR ISJSON(OptionCorrespondenceJson) = 1)
    );
END;
GO

-- One-to-one: a live (non-deleted) mapping per PG field and per AI field (BS §6.2 "one-to-one only").
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CrossingMap_PgField' AND object_id = OBJECT_ID(N'dbo.CrossingMap'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_CrossingMap_PgField
        ON dbo.CrossingMap (PgFieldDefinitionId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CrossingMap_AiField' AND object_id = OBJECT_ID(N'dbo.CrossingMap'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_CrossingMap_AiField
        ON dbo.CrossingMap (AiFieldDefinitionId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_054_CreateCrossingMap')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260706_054_CreateCrossingMap', SUSER_SNAME(), N'Slice 24 — durable CrossingMap table (propose/confirm crossing-field mappings).');
END;
GO

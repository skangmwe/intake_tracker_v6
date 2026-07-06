-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Creates dbo.Features — the reusable-feature inventory record (BS §2.5 / §18,
--              data-model.md §Feature). A feature runs on the same metadata engine as a Request:
--              content-field values live in a single FieldValues JSON map, and a few list-critical
--              values are projected as PERSISTED computed columns so the catalog list
--              filters/sorts/covers without parsing JSON per row.
--
--              Features are AI-Solutions-workspace-only (the reporting hub) — the object type,
--              not a distinct prefix, distinguishes a feature from a Request (BS §18.1), so the id
--              is minted from the AI workspace's own prefix/sequence via usp_MintRecordId. A
--              feature NEVER escalates and never crosses the bridge, so there is no shared-key /
--              second-row concern here; the composite PK (WorkspaceId, RecordId) matches the
--              Requests shape for consistency and the shared minted id.
--
--              Name and Maturity are authoritative real columns (Name required, hot on lists;
--              Maturity set directly by publish/deprecate — no approval gate, BS §18.5). Both are
--              mirrored into FieldValues so the condition engine / saved views read one map.
--              RowVer (ROWVERSION) backs the PATCH ETag / optimistic concurrency.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Features', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Features
    (
        RecordId     NVARCHAR(20)     NOT NULL,
        -- Always the AI Solutions workspace (features are hub-only, BS §2.5).
        WorkspaceId  UNIQUEIDENTIFIER NOT NULL,
        -- The originating workspace name, resolved from the ID prefix at mint (BS §17.1 / §18.1).
        Origin       NVARCHAR(200)    NULL,
        Name         NVARCHAR(400)    NOT NULL,
        -- Draft -> Published -> Deprecated (BS §18.5). Set directly by publish/deprecate — no gate.
        Maturity     NVARCHAR(16)     NOT NULL CONSTRAINT DF_Features_Maturity DEFAULT N'Draft',
        -- The content-field map keyed by field key (BS §18): oneLiner, whatItDoes, featureType,
        -- capabilityTags[], solutionPattern[], techStack[], howToReuse, demoUrl, repoUrl, owner,
        -- dataClassification, complianceFlags[]. Name + Maturity are ALSO promoted to real columns
        -- above and mirrored into this map so saved views / the condition engine read one source.
        FieldValues  NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_Features_FieldValues DEFAULT N'{}',

        -- List-critical projections from the JSON map (PERSISTED so they index and cover).
        OneLiner     AS CAST(JSON_VALUE(FieldValues, N'$.oneLiner')    AS NVARCHAR(400)) PERSISTED,
        FeatureType  AS CAST(JSON_VALUE(FieldValues, N'$.featureType') AS NVARCHAR(32))  PERSISTED,
        OwnerUserId  AS CAST(JSON_VALUE(FieldValues, N'$.owner')       AS NVARCHAR(200)) PERSISTED,

        RowVer       ROWVERSION       NOT NULL,

        CreatedAt    DATETIME2        NOT NULL CONSTRAINT DF_Features_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2        NOT NULL CONSTRAINT DF_Features_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy    NVARCHAR(256)    NOT NULL,
        UpdatedBy    NVARCHAR(256)    NOT NULL,
        IsDeleted    BIT              NOT NULL CONSTRAINT DF_Features_IsDeleted DEFAULT 0,
        DeletedAt    DATETIME2        NULL,

        -- Composite PK mirrors Requests for the shared minted id (a feature exists once per
        -- workspace; features never duplicate across the bridge — they never cross it).
        CONSTRAINT PK_Features PRIMARY KEY CLUSTERED (WorkspaceId, RecordId),
        CONSTRAINT FK_Features_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Features_Maturity CHECK (Maturity IN (N'Draft', N'Published', N'Deprecated')),
        CONSTRAINT CK_Features_FieldValues_Json CHECK (ISJSON(FieldValues) = 1)
    );
END;
GO

-- Id lookup (detail read + typed-link resolution).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Features_RecordId' AND object_id = OBJECT_ID(N'dbo.Features'))
    CREATE NONCLUSTERED INDEX IX_Features_RecordId
        ON dbo.Features (RecordId) WHERE IsDeleted = 0;
GO

-- Covering index for the Feature Catalog list surface (S9).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Features_List' AND object_id = OBJECT_ID(N'dbo.Features'))
    CREATE NONCLUSTERED INDEX IX_Features_List
        ON dbo.Features (WorkspaceId, IsDeleted)
        INCLUDE (Name, Maturity, OneLiner, FeatureType, OwnerUserId, Origin, UpdatedAt);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_044_CreateFeatures')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_044_CreateFeatures', SUSER_SNAME(), N'Slice 14 — Features table (Feature Catalog record).');
END;
GO

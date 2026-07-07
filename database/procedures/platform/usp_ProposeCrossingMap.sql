-- =============================================
-- Author:      /dev-build-application (Slice 24 — admin-editable crossing map, S35)
-- Create Date: 2026-07-06
-- Description: Proposes a PG→AI crossing-field mapping (BS §6.2). Creates a CrossingMap row in
--              Status='Proposed'. Validates BEFORE opening a transaction (a guard THROW must never
--              issue a ROLLBACK — tSQLt-safe). Not an access-gate proc: the controller's Platform-admin
--              AccessGuard is authoritative. Guards:
--                50080 — either field is missing / retired / soft-deleted.
--                50081 — a derived (Calculation / DerivedCategory) or platform-defined field can't be mapped.
--                50082 — the two fields' types differ (one-to-one requires a compatible type).
--                50083 — wrong direction (source must be a PG/Dept field, target an AI-Solutions field).
--                50084 — either side is already in a live mapping (one-to-one; the unique indexes back this up).
--                50085 — option correspondence supplied for a non-select field, or a mapped option value
--                        is not a real option on its side.
--              Returns the created mapping resolved to display fields (single result set).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ProposeCrossingMap
    @PgFieldDefinitionId      UNIQUEIDENTIFIER,
    @AiFieldDefinitionId      UNIQUEIDENTIFIER,
    @OptionCorrespondenceJson NVARCHAR(MAX) = NULL,
    @ActorUserId              NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @PgId    UNIQUEIDENTIFIER = @PgFieldDefinitionId;
    DECLARE @AiId    UNIQUEIDENTIFIER = @AiFieldDefinitionId;
    DECLARE @Options NVARCHAR(MAX)    = NULLIF(LTRIM(RTRIM(@OptionCorrespondenceJson)), N'');
    DECLARE @Actor   NVARCHAR(256)    = @ActorUserId;

    DECLARE @PgType NVARCHAR(32), @PgKind NVARCHAR(32), @PgPlatform BIT;
    DECLARE @AiType NVARCHAR(32), @AiKind NVARCHAR(32), @AiPlatform BIT;

    SELECT @PgType = fd.FieldType, @PgKind = ws.Kind, @PgPlatform = fd.IsPlatformDefined
    FROM dbo.FieldDefinition AS fd
    INNER JOIN dbo.Workspaces AS ws ON ws.WorkspaceId = fd.WorkspaceId
    WHERE fd.FieldDefinitionId = @PgId AND fd.IsDeleted = 0 AND fd.IsRetired = 0;

    SELECT @AiType = fd.FieldType, @AiKind = ws.Kind, @AiPlatform = fd.IsPlatformDefined
    FROM dbo.FieldDefinition AS fd
    INNER JOIN dbo.Workspaces AS ws ON ws.WorkspaceId = fd.WorkspaceId
    WHERE fd.FieldDefinitionId = @AiId AND fd.IsDeleted = 0 AND fd.IsRetired = 0;

    IF @PgType IS NULL OR @AiType IS NULL
        THROW 50080, 'A field in the mapping was not found (or is retired).', 1;

    IF @PgType IN (N'Calculation', N'DerivedCategory') OR @AiType IN (N'Calculation', N'DerivedCategory')
       OR @PgPlatform = 1 OR @AiPlatform = 1
        THROW 50081, 'Derived and platform-defined fields cannot be mapped.', 1;

    IF @PgType <> @AiType
        THROW 50082, 'The fields must be the same type to map.', 1;

    IF @PgKind NOT IN (N'pg-dept-template', N'pg-dept') OR @AiKind <> N'ai-solutions'
        THROW 50083, 'A mapping goes from a PG/Dept field to an AI Solutions field.', 1;

    IF EXISTS (SELECT 1 FROM dbo.CrossingMap
               WHERE IsDeleted = 0 AND (PgFieldDefinitionId = @PgId OR AiFieldDefinitionId = @AiId))
        THROW 50084, 'One of these fields is already mapped.', 1;

    -- Option-set check: only select types may carry an option map; every mapped value must be a real option.
    IF @Options IS NOT NULL
    BEGIN
        IF @PgType NOT IN (N'SingleSelect', N'MultiSelect')
            THROW 50085, 'Option correspondence is only valid for select fields.', 1;

        -- OPENJSON keys/values come back as Latin1_General_BIN2; force the DB default collation on the
        -- comparison so it doesn't conflict with SelectOption.OptionValue's collation.
        IF EXISTS (
            SELECT 1 FROM OPENJSON(@Options) AS optMap
            WHERE NOT EXISTS (SELECT 1 FROM dbo.SelectOption AS pgOpt
                              WHERE pgOpt.FieldDefinitionId = @PgId AND pgOpt.IsDeleted = 0
                                AND pgOpt.OptionValue = optMap.[key] COLLATE DATABASE_DEFAULT)
               OR NOT EXISTS (SELECT 1 FROM dbo.SelectOption AS aiOpt
                              WHERE aiOpt.FieldDefinitionId = @AiId AND aiOpt.IsDeleted = 0
                                AND aiOpt.OptionValue = CONVERT(NVARCHAR(400), optMap.[value]) COLLATE DATABASE_DEFAULT))
            THROW 50085, 'An option in the correspondence map is not a valid option on its field.', 1;
    END;

    DECLARE @NewId UNIQUEIDENTIFIER = NEWID();

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.CrossingMap
            (CrossingMapId, PgFieldDefinitionId, AiFieldDefinitionId, OptionCorrespondenceJson, Status, CreatedBy, UpdatedBy)
        VALUES
            (@NewId, @PgId, @AiId, @Options, N'Proposed', @Actor, @Actor);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    -- Return the created mapping resolved to display fields (same shape usp_GetCrossingMap emits).
    SELECT
        cm.CrossingMapId,
        pg.FieldKey         AS SourceFieldKey,
        pg.DisplayName      AS SourceDisplayName,
        pg.FieldType        AS SourceFieldType,
        ai.FieldKey         AS TargetFieldKey,
        ai.DisplayName      AS TargetDisplayName,
        ai.FieldType        AS TargetFieldType,
        cm.Status,
        cm.OptionCorrespondenceJson,
        cm.ConfirmedByUserId,
        cm.ConfirmedAt
    FROM dbo.CrossingMap AS cm
    INNER JOIN dbo.FieldDefinition AS pg ON pg.FieldDefinitionId = cm.PgFieldDefinitionId
    INNER JOIN dbo.FieldDefinition AS ai ON ai.FieldDefinitionId = cm.AiFieldDefinitionId
    WHERE cm.CrossingMapId = @NewId;
END;
GO

-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Inserts or updates one FieldDefinition and replaces its child config —
--              SelectOptions, FieldRules, the DerivedField header, and this field's
--              outgoing dependency edges — in a single transaction (BS §3, §17). The
--              acyclic + depth<=3 graph check runs in the API's ConditionEngine BEFORE
--              this proc is called; the caller passes the validated dependency edge list.
--
--              Guards: a platform-defined field (§4.3) cannot be created or redefined
--              here — those are governed centrally in S34; THROW if the key resolves to a
--              platform-defined field. Child rows are soft-deleted then re-inserted
--              (the WHERE IsDeleted=0 filtered unique indexes allow value re-use).
--
--              JSON params:
--                @OptionsJson      = [{"value","label","sortOrder"}]
--                @RulesJson        = [{"action","whenFieldKey","comparator","compareValue","produceValue","sortOrder"}]
--                @DependenciesJson = ["toFieldKeyA","toFieldKeyB"]
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertFieldDefinition
    @WorkspaceId        UNIQUEIDENTIFIER,
    @ObjectType         NVARCHAR(64),
    @FieldKey           NVARCHAR(64),
    @DisplayName        NVARCHAR(200),
    @FieldType          NVARCHAR(32),
    @Category           NVARCHAR(16),
    @Location           NVARCHAR(20)   = N'LocalWorkspace',
    @Section            NVARCHAR(64)   = NULL,
    @HelpText           NVARCHAR(400)  = NULL,
    @IsRequired         BIT            = 0,
    @VisibleStagesJson  NVARCHAR(MAX)  = NULL,
    @CrossingToFieldKey NVARCHAR(64)   = NULL,
    @MinValue           DECIMAL(18, 4) = NULL,
    @MaxValue           DECIMAL(18, 4) = NULL,
    @AllowNewValues     BIT            = 0,
    @SortOrder          INT            = 0,
    @DerivedKind        NVARCHAR(16)   = NULL,
    @DerivedExpression  NVARCHAR(1000) = NULL,
    @DerivedDefaultValue NVARCHAR(400) = NULL,
    @OptionsJson        NVARCHAR(MAX)  = NULL,
    @RulesJson          NVARCHAR(MAX)  = NULL,
    @DependenciesJson   NVARCHAR(MAX)  = NULL,
    @ActorUserId        NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Parameter-sniffing mitigation.
    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(64)     = @ObjectType;
    DECLARE @FieldKeyLocal     NVARCHAR(64)    = @FieldKey;
    DECLARE @Actor             NVARCHAR(256)   = @ActorUserId;
    DECLARE @Now               DATETIME2       = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @FieldDefinitionId UNIQUEIDENTIFIER;
        DECLARE @IsPlatformDefined BIT;

        SELECT @FieldDefinitionId = FieldDefinitionId, @IsPlatformDefined = IsPlatformDefined
        FROM dbo.FieldDefinition
        WHERE WorkspaceId = @WorkspaceIdLocal AND ObjectType = @ObjectTypeLocal
          AND FieldKey = @FieldKeyLocal AND IsDeleted = 0;

        IF @IsPlatformDefined = 1
            THROW 50010, 'This field is platform-defined and is governed centrally (S34); it cannot be edited here.', 1;

        IF @FieldDefinitionId IS NULL
        BEGIN
            SET @FieldDefinitionId = NEWID();
            INSERT INTO dbo.FieldDefinition
                (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, Section,
                 HelpText, IsRequired, IsReadOnly, VisibleStagesJson, CrossingToFieldKey, MinValue, MaxValue,
                 AllowNewValues, SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            VALUES
                (@FieldDefinitionId, @WorkspaceIdLocal, @ObjectTypeLocal, @FieldKeyLocal, @DisplayName, @FieldType, @Category, @Location, @Section,
                 @HelpText, @IsRequired, CASE WHEN @DerivedKind IS NULL THEN 0 ELSE 1 END, @VisibleStagesJson, @CrossingToFieldKey, @MinValue, @MaxValue,
                 @AllowNewValues, @SortOrder, @Actor, @Actor, @Now, @Now);
        END
        ELSE
        BEGIN
            UPDATE dbo.FieldDefinition
            SET DisplayName = @DisplayName, FieldType = @FieldType, Category = @Category, Location = @Location, Section = @Section,
                HelpText = @HelpText, IsRequired = @IsRequired, IsReadOnly = CASE WHEN @DerivedKind IS NULL THEN 0 ELSE 1 END,
                VisibleStagesJson = @VisibleStagesJson, CrossingToFieldKey = @CrossingToFieldKey,
                MinValue = @MinValue, MaxValue = @MaxValue, AllowNewValues = @AllowNewValues, SortOrder = @SortOrder,
                UpdatedBy = @Actor, UpdatedAt = @Now
            WHERE FieldDefinitionId = @FieldDefinitionId;
        END

        -- Replace SelectOptions (soft-delete then insert).
        UPDATE dbo.SelectOption SET IsDeleted = 1, DeletedAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
        WHERE FieldDefinitionId = @FieldDefinitionId AND IsDeleted = 0;

        IF @OptionsJson IS NOT NULL
            INSERT INTO dbo.SelectOption (FieldDefinitionId, OptionValue, OptionLabel, SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            SELECT @FieldDefinitionId, j.OptionValue, j.OptionLabel, j.SortOrder, @Actor, @Actor, @Now, @Now
            FROM OPENJSON(@OptionsJson)
                WITH (OptionValue NVARCHAR(200) '$.value', OptionLabel NVARCHAR(200) '$.label', SortOrder INT '$.sortOrder') AS j;

        -- Replace FieldRules (soft-delete then insert).
        UPDATE dbo.FieldRule SET IsDeleted = 1, DeletedAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
        WHERE FieldDefinitionId = @FieldDefinitionId AND IsDeleted = 0;

        IF @RulesJson IS NOT NULL
            INSERT INTO dbo.FieldRule (FieldDefinitionId, [Action], WhenFieldKey, Comparator, CompareValue, ProduceValue, SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            SELECT @FieldDefinitionId, j.[Action], j.WhenFieldKey, j.Comparator, j.CompareValue, j.ProduceValue, j.SortOrder, @Actor, @Actor, @Now, @Now
            FROM OPENJSON(@RulesJson)
                WITH ([Action] NVARCHAR(16) '$.action', WhenFieldKey NVARCHAR(64) '$.whenFieldKey',
                      Comparator NVARCHAR(16) '$.comparator', CompareValue NVARCHAR(400) '$.compareValue',
                      ProduceValue NVARCHAR(400) '$.produceValue', SortOrder INT '$.sortOrder') AS j;

        -- Replace the DerivedField header (soft-delete then insert when derived).
        UPDATE dbo.DerivedField SET IsDeleted = 1, DeletedAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
        WHERE FieldDefinitionId = @FieldDefinitionId AND IsDeleted = 0;

        IF @DerivedKind IS NOT NULL
            INSERT INTO dbo.DerivedField (FieldDefinitionId, Kind, Expression, DefaultValue, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            VALUES (@FieldDefinitionId, @DerivedKind, @DerivedExpression, @DerivedDefaultValue, @Actor, @Actor, @Now, @Now);

        -- Rewrite this field's outgoing dependency edges (soft-delete then insert).
        UPDATE dbo.FieldRuleDependency SET IsDeleted = 1, DeletedAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
        WHERE WorkspaceId = @WorkspaceIdLocal AND ObjectType = @ObjectTypeLocal
          AND FromFieldKey = @FieldKeyLocal AND IsDeleted = 0;

        IF @DependenciesJson IS NOT NULL
            INSERT INTO dbo.FieldRuleDependency (WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            SELECT @WorkspaceIdLocal, @ObjectTypeLocal, @FieldKeyLocal, j.ToFieldKey, @Actor, @Actor, @Now, @Now
            FROM OPENJSON(@DependenciesJson) WITH (ToFieldKey NVARCHAR(64) '$') AS j;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

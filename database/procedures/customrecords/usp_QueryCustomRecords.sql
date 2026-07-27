-- =============================================
-- Author:      /dev-build-application (Slice A — Custom-object records: JSON-field filter/sort)
-- Create Date: 2026-07-24
-- Description: Returns a page of a custom object's records in a workspace, filtered and sorted over
--              BOTH the stable columns (name / created / updated) and the object's user fields held
--              in the FieldValues JSON bag. Each page row carries TotalCount = COUNT(*) OVER() (the
--              full matching count, constant across the page) so the caller (CustomRecordsService,
--              FromSqlRaw) builds the paginated envelope from a SINGLE result set. Soft-deleted rows
--              and rows of another workspace/object are excluded. FieldValues is Confidential — never
--              logged (api-pii-handling.md).
--
--              Updated 2026-07-26 (SP3b Slice 2a) — the @Fields filter/sort whitelist (below)
--              includes both the calling workspace's own local fields AND every platform Global
--              field on the same object slug, so a Global field is filterable/sortable in every
--              workspace. The Global arm requires WorkspaceId IS NULL (not Location alone) so a
--              workspace-owned row mislabelled Location='Global' (FieldDefinition places no
--              server-side constraint tying Location to WorkspaceId) is never surfaced to another
--              workspace's whitelist — mirrors usp_ListObjectDefinitions / usp_GetObjectDefinitionById's
--              ownership-gated Global arm. Scoped by ObjectType = @Slug, so there is no
--              cross-object bleed; a DIFFERENT workspace's own local field on the same slug is
--              still excluded from this workspace's whitelist.
--
--              INJECTION SAFETY (this proc is the designated high-risk review target):
--                * A field key reaches the dynamic SQL text ONLY after it matched a real, active
--                  FieldDefinition row for this object (the @Fields whitelist). Unknown filter keys
--                  are silently ignored; an unknown sort key falls back to Name.
--                * Field keys are workspace-generated slugs ([a-z0-9-]) and are emitted only inside a
--                  '$."<key>"' JSON path literal. No user VALUE is ever concatenated into SQL text —
--                  every comparand is read via JSON_VALUE(@FiltersJson, …) at execution time, with
--                  @FiltersJson passed to sp_executesql as a parameter.
--                * The number operator is one of a fixed literal allow-set {>,>=,=,<=,<} emitted in
--                  the query text; the caller-supplied op is only ever COMPARED (via JSON_VALUE)
--                  against those literals at run time — an absent/invalid op skips the predicate.
--                * Sort direction is normalised to the literals ASC / DESC.
--
--              @FiltersJson contract (a JSON object keyed by column key; the C# service builds this):
--                "name"    → { "type":"text", "contains":"<str>" }
--                "created" → { "type":"date", "from":"<iso>"?, "to":"<iso>"? }   (on CreatedAt)
--                "updated" → { "type":"date", "from":"<iso>"?, "to":"<iso>"? }   (on UpdatedAt)
--                <user field key> (must match a FieldDefinition row) → one of:
--                  { "type":"text",   "contains":"<str>" }
--                  { "type":"select", "values":[ ... ] }
--                  { "type":"number", "op":">"|">="|"="|"<="|"<", "value":<num> }
--                  { "type":"date",   "from":"<iso>"?, "to":"<iso>"? }
--              @SortColumn: name | created | updated | <user field key>  (else → Name).
--              @SortDir:    asc | desc (anything else → asc).
-- =============================================

-- =============================================
-- Author:      /dev-build-application (Slice A — Custom-object records: JSON-field filter/sort)
-- Create Date: 2026-07-24
-- Description: Predicate builder for one filter key of usp_QueryCustomRecords. Returns the
--              parameterised WHERE fragment (leading " AND ") for the key, or N'' when the key is
--              not filterable (unknown key, non-filterable field type, or an invalid number
--              operator). @Key is always a whitelisted slug or a stable-column name; @FieldType is
--              the field's type for a user field, or NULL for a stable/unknown key.
--
--              The returned text references @FiltersJson (the outer sp_executesql parameter) and
--              cr.FieldValues — every comparand is read via JSON_VALUE(@FiltersJson, …) at execution
--              time, never concatenated from user input. `contains` (text) predicates escape the
--              LIKE metacharacters [ % _ in the JSON_VALUE'd term (bracket-escaping form) so a value
--              like '100%' or 'a_b' is matched literally, not as a wildcard.
-- =============================================
CREATE OR ALTER FUNCTION dbo.fn_BuildCustomRecordPredicate
(
    @Key       NVARCHAR(64),
    @FieldType NVARCHAR(32)
)
RETURNS NVARCHAR(MAX)
AS
BEGIN
    -- Stable columns (independent of @FieldType).
    IF @Key = N'name'
        RETURN N' AND cr.Name LIKE N''%'' + REPLACE(REPLACE(REPLACE(JSON_VALUE(@FiltersJson, ''$."name".contains''), N''['', N''[[]''), N''%'', N''[%]''), N''_'', N''[_]'') + N''%''';
    IF @Key = N'created'
        RETURN N' AND (JSON_VALUE(@FiltersJson, ''$."created".from'') IS NULL OR cr.CreatedAt >= TRY_CAST(JSON_VALUE(@FiltersJson, ''$."created".from'') AS DATETIME2))'
             + N' AND (JSON_VALUE(@FiltersJson, ''$."created".to'')   IS NULL OR cr.CreatedAt <= TRY_CAST(JSON_VALUE(@FiltersJson, ''$."created".to'')   AS DATETIME2))';
    IF @Key = N'updated'
        RETURN N' AND (JSON_VALUE(@FiltersJson, ''$."updated".from'') IS NULL OR cr.UpdatedAt >= TRY_CAST(JSON_VALUE(@FiltersJson, ''$."updated".from'') AS DATETIME2))'
             + N' AND (JSON_VALUE(@FiltersJson, ''$."updated".to'')   IS NULL OR cr.UpdatedAt <= TRY_CAST(JSON_VALUE(@FiltersJson, ''$."updated".to'')   AS DATETIME2))';

    -- Unknown key (not a real field for this object) → ignored, not an error.
    IF @FieldType IS NULL
        RETURN N'';

    -- The stored value for this field: JSON_VALUE(cr.FieldValues, '$."<key>"'). @Key is whitelisted.
    DECLARE @Val NVARCHAR(300) = N'JSON_VALUE(cr.FieldValues, ''$."' + @Key + N'"'')';

    -- Text families → case-insensitive LIKE contains (default DB collation is CI). The search term is
    -- bracket-escaped ([ % _) so LIKE metacharacters in the value match literally.
    IF @FieldType IN (N'ShortText', N'LongText', N'RichText', N'Url')
        RETURN N' AND ' + @Val + N' LIKE N''%'' + REPLACE(REPLACE(REPLACE(JSON_VALUE(@FiltersJson, ''$."' + @Key + N'".contains''), N''['', N''[[]''), N''%'', N''[%]''), N''_'', N''[_]'') + N''%''';

    -- Select families → membership in the supplied values array (IN). OPENJSON's [value] is BIN2;
    -- COLLATE DATABASE_DEFAULT so it compares against the default-collation stored value.
    IF @FieldType IN (N'SingleSelect', N'MultiSelect')
        RETURN N' AND EXISTS (SELECT 1 FROM OPENJSON(@FiltersJson, ''$."' + @Key + N'".values'') v WHERE v.[value] COLLATE DATABASE_DEFAULT = ' + @Val + N')';

    -- Number families → numeric compare. The op is compared (never emitted) against the fixed
    -- literal allow-set; an absent/invalid op makes the first disjunct true → the predicate is a
    -- no-op (skipped), so the row set is unfiltered by this key.
    IF @FieldType IN (N'Number', N'Decimal', N'Currency', N'Percent')
    BEGIN
        DECLARE @Op  NVARCHAR(MAX) = N'JSON_VALUE(@FiltersJson, ''$."' + @Key + N'".op'')';
        DECLARE @Lhs NVARCHAR(MAX) = N'TRY_CAST(' + @Val + N' AS DECIMAL(38,10))';
        DECLARE @Rhs NVARCHAR(MAX) = N'TRY_CAST(JSON_VALUE(@FiltersJson, ''$."' + @Key + N'".value'') AS DECIMAL(38,10))';
        RETURN N' AND (' + @Op + N' NOT IN (N''>'', N''>='', N''='', N''<='', N''<'')'
             + N' OR (' + @Op + N' = N''>''  AND ' + @Lhs + N' >  ' + @Rhs + N')'
             + N' OR (' + @Op + N' = N''>='' AND ' + @Lhs + N' >= ' + @Rhs + N')'
             + N' OR (' + @Op + N' = N''=''  AND ' + @Lhs + N' =  ' + @Rhs + N')'
             + N' OR (' + @Op + N' = N''<='' AND ' + @Lhs + N' <= ' + @Rhs + N')'
             + N' OR (' + @Op + N' = N''<''  AND ' + @Lhs + N' <  ' + @Rhs + N'))';
    END

    -- Date families → from/to range on the value cast to DATETIME2.
    IF @FieldType IN (N'Date', N'DateTime')
        RETURN N' AND (JSON_VALUE(@FiltersJson, ''$."' + @Key + N'".from'') IS NULL OR TRY_CAST(' + @Val + N' AS DATETIME2) >= TRY_CAST(JSON_VALUE(@FiltersJson, ''$."' + @Key + N'".from'') AS DATETIME2))'
             + N' AND (JSON_VALUE(@FiltersJson, ''$."' + @Key + N'".to'')   IS NULL OR TRY_CAST(' + @Val + N' AS DATETIME2) <= TRY_CAST(JSON_VALUE(@FiltersJson, ''$."' + @Key + N'".to'')   AS DATETIME2))';

    -- Boolean / UserReference / RecordReference / Calculation / DerivedCategory → not filterable.
    RETURN N'';
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_QueryCustomRecords
    @WorkspaceId        UNIQUEIDENTIFIER,
    @ObjectDefinitionId UNIQUEIDENTIFIER,
    @Page               INT,
    @PageSize           INT,
    @FiltersJson        NVARCHAR(MAX)  = NULL,
    @SortColumn         NVARCHAR(128)  = N'name',
    @SortDir            NVARCHAR(4)    = N'asc'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Parameter sniffing mitigation — copy inputs into locals (database-stored-procedures.md).
    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Obj  UNIQUEIDENTIFIER = @ObjectDefinitionId;
    DECLARE @Filt NVARCHAR(MAX)    = @FiltersJson;
    DECLARE @Page1 INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size  INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @Dir   NVARCHAR(4) = CASE WHEN LOWER(@SortDir) = N'desc' THEN N'DESC' ELSE N'ASC' END;

    -- The object's immutable slug — the FieldDefinition.ObjectType discriminator for its user fields.
    DECLARE @Slug NVARCHAR(64) =
        (SELECT ObjectKey FROM dbo.ObjectDefinition
          WHERE ObjectDefinitionId = @Obj AND IsDeleted = 0);

    -- Whitelist of the object's user fields (key + type). Only keys present here may enter SQL text.
    -- The Global arm requires WorkspaceId IS NULL (not Location alone) — a workspace-owned row
    -- mislabelled Location='Global' must never enter another workspace's whitelist (same leak
    -- class usp_ListObjectDefinitions / usp_GetObjectDefinitionById guard against).
    -- A local field can share a key with a (truly platform-owned) Global field (usp_GetWorkspaceFields's
    -- "local override" case); de-dupe by key with the local (WorkspaceId = @Ws) row winning — same
    -- precedence as usp_GetWorkspaceFields — so the @Fields PRIMARY KEY never collides.
    DECLARE @Fields TABLE (FieldKey NVARCHAR(64) PRIMARY KEY, FieldType NVARCHAR(32) NOT NULL);
    INSERT INTO @Fields (FieldKey, FieldType)
        SELECT FieldKey, FieldType
        FROM (
            SELECT FieldKey, FieldType,
                   ROW_NUMBER() OVER (
                       PARTITION BY FieldKey
                       ORDER BY CASE WHEN WorkspaceId = @Ws THEN 0 ELSE 1 END) AS RowRank
            FROM   dbo.FieldDefinition
            WHERE  (WorkspaceId = @Ws OR (WorkspaceId IS NULL AND Location = N'Global'))
              AND  ObjectType = @Slug AND IsDeleted = 0 AND IsRetired = 0
        ) AS ranked
        WHERE ranked.RowRank = 1;

    -- Build the WHERE fragment: one predicate per filter key that is a stable column OR a whitelisted
    -- field. Field values are read via JSON_VALUE(@FiltersJson, …) at exec time (never concatenated).
    DECLARE @Where NVARCHAR(MAX) = N'';
    IF @Filt IS NOT NULL
    BEGIN
        -- OPENJSON's [key] column is BIN2-collated; force DB default to join the whitelist safely.
        SELECT @Where = ISNULL(STRING_AGG(p.predicate, N''), N'')
        FROM OPENJSON(@Filt) k
        OUTER APPLY (SELECT TOP 1 f.FieldType FROM @Fields f
                     WHERE f.FieldKey = k.[key] COLLATE DATABASE_DEFAULT) ft
        CROSS APPLY (SELECT predicate =
                     dbo.fn_BuildCustomRecordPredicate(k.[key] COLLATE DATABASE_DEFAULT, ft.FieldType)) p;
    END;

    -- Sort expression: a stable column, or a whitelisted field key cast per its type, else Name.
    DECLARE @OrderExpr NVARCHAR(400);
    IF @SortColumn = N'name'    SET @OrderExpr = N'cr.Name';
    ELSE IF @SortColumn = N'created' SET @OrderExpr = N'cr.CreatedAt';
    ELSE IF @SortColumn = N'updated' SET @OrderExpr = N'cr.UpdatedAt';
    ELSE
    BEGIN
        DECLARE @SortKey  NVARCHAR(64);
        DECLARE @SortType NVARCHAR(32);
        SELECT @SortKey = f.FieldKey, @SortType = f.FieldType
        FROM   @Fields f WHERE f.FieldKey = @SortColumn;

        SET @OrderExpr = CASE
            WHEN @SortKey IS NULL THEN N'cr.Name'
            WHEN @SortType IN (N'Number', N'Decimal', N'Currency', N'Percent')
                THEN N'TRY_CAST(JSON_VALUE(cr.FieldValues, ''$."' + @SortKey + N'"'') AS DECIMAL(38,10))'
            WHEN @SortType IN (N'Date', N'DateTime')
                THEN N'TRY_CAST(JSON_VALUE(cr.FieldValues, ''$."' + @SortKey + N'"'') AS DATETIME2)'
            ELSE N'JSON_VALUE(cr.FieldValues, ''$."' + @SortKey + N'"'')'
        END;
    END;
    IF @OrderExpr IS NULL SET @OrderExpr = N'cr.Name';

    DECLARE @Sql NVARCHAR(MAX) =
        N'SELECT cr.RecordId, cr.Name, cr.FieldValues, cr.RowVer, TotalCount = COUNT(*) OVER() '
      + N'FROM dbo.CustomRecords cr '
      + N'WHERE cr.WorkspaceId = @ws AND cr.ObjectDefinitionId = @obj AND cr.IsDeleted = 0'
      + @Where
      + N' ORDER BY ' + @OrderExpr + N' ' + @Dir + N', cr.RecordId ASC'
      + N' OFFSET (@p - 1) * @s ROWS FETCH NEXT @s ROWS ONLY;';

    EXEC sys.sp_executesql @Sql,
        N'@ws UNIQUEIDENTIFIER, @obj UNIQUEIDENTIFIER, @p INT, @s INT, @FiltersJson NVARCHAR(MAX)',
        @ws = @Ws, @obj = @Obj, @p = @Page1, @s = @Size, @FiltersJson = @Filt;
END;
GO

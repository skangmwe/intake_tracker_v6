-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin; extended slice 24)
-- Create Date: 2026-07-06
-- Description: Returns the firm crossing map (S35). Two kinds of row, UNIONed into one feed:
--                1. SEEDED (Status='Seeded', CrossingMapId=NULL) — the immutable 1:1 pairs derived
--                   from FieldDefinition: a PG/Dept-template Request crossing field ([S],
--                   Category='Crossing') joined to the AI Solutions field its CrossingToFieldKey
--                   points at. Both workspaces resolved by Kind. Retired/deleted fields excluded.
--                2. DURABLE (Status='Proposed'|'Confirmed') — admin-authored mappings from the
--                   CrossingMap table (slice 24), resolved to display fields, carrying the option map
--                   and the confirmed-by/at audit.
--              Seeded rows sort first (by the source SortOrder), then durable rows by CreatedAt.
--              Not an access-gate proc: the controller's Platform-admin AccessGuard is authoritative.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetCrossingMap
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @AiWorkspaceId       UNIQUEIDENTIFIER =
        (SELECT TOP (1) WorkspaceId FROM dbo.Workspaces WHERE Kind = N'ai-solutions' AND IsDeleted = 0);
    DECLARE @TemplateWorkspaceId UNIQUEIDENTIFIER =
        (SELECT TOP (1) WorkspaceId FROM dbo.Workspaces WHERE Kind = N'pg-dept-template' AND IsDeleted = 0);

    SELECT
        CrossingMapId, SourceFieldKey, SourceDisplayName, SourceFieldType,
        TargetFieldKey, TargetDisplayName, TargetFieldType, Status,
        OptionCorrespondenceJson, ConfirmedByUserId, ConfirmedAt
    FROM
    (
        -- Seeded 1:1 pairs (read-only).
        SELECT
            CAST(NULL AS UNIQUEIDENTIFIER) AS CrossingMapId,
            src.FieldKey        AS SourceFieldKey,
            src.DisplayName     AS SourceDisplayName,
            src.FieldType       AS SourceFieldType,
            tgt.FieldKey        AS TargetFieldKey,
            tgt.DisplayName     AS TargetDisplayName,
            tgt.FieldType       AS TargetFieldType,
            N'Seeded'           AS Status,
            CAST(NULL AS NVARCHAR(MAX))    AS OptionCorrespondenceJson,
            CAST(NULL AS NVARCHAR(256))    AS ConfirmedByUserId,
            CAST(NULL AS DATETIME2)        AS ConfirmedAt,
            0                   AS SortBucket,
            src.SortOrder       AS SortKey,
            src.CreatedAt       AS TieBreak
        FROM dbo.FieldDefinition AS src
        INNER JOIN dbo.FieldDefinition AS tgt
            ON tgt.WorkspaceId = @AiWorkspaceId
           AND tgt.ObjectType = N'Request'
           AND tgt.FieldKey = src.CrossingToFieldKey
           AND tgt.IsRetired = 0
           AND tgt.IsDeleted = 0
        WHERE src.WorkspaceId = @TemplateWorkspaceId
          AND src.ObjectType = N'Request'
          AND src.Category = N'Crossing'
          AND src.CrossingToFieldKey IS NOT NULL
          AND src.IsRetired = 0
          AND src.IsDeleted = 0

        UNION ALL

        -- Durable admin-authored mappings (propose/confirm).
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
            cm.ConfirmedAt,
            1                   AS SortBucket,
            0                   AS SortKey,
            cm.CreatedAt        AS TieBreak
        FROM dbo.CrossingMap AS cm
        INNER JOIN dbo.FieldDefinition AS pg ON pg.FieldDefinitionId = cm.PgFieldDefinitionId
        INNER JOIN dbo.FieldDefinition AS ai ON ai.FieldDefinitionId = cm.AiFieldDefinitionId
        WHERE cm.IsDeleted = 0
    ) AS mapped
    ORDER BY mapped.SortBucket, mapped.SortKey, mapped.TieBreak;
END;
GO

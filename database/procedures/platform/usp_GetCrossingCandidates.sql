-- =============================================
-- Author:      /dev-build-application (Slice 24 — admin-editable crossing map, S35)
-- Create Date: 2026-07-06
-- Description: Returns the fields a Platform admin may pick when proposing a crossing mapping (S35
--              propose form). Each row is a mappable Request field on one side:
--                Side = 'PG' — a PG/Dept-template Request field.
--                Side = 'AI' — an AI-Solutions Request field.
--              Excludes retired / deleted fields, derived (Calculation / DerivedCategory) and
--              platform-defined fields (BS §6.2 "derived and system fields cannot be mapped"), and
--              any field already in a live (non-deleted) CrossingMap mapping (one-to-one). Ordered by
--              side then display name. Not an access-gate proc: the controller gates on Platform admin.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetCrossingCandidates
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @AiWorkspaceId       UNIQUEIDENTIFIER =
        (SELECT TOP (1) WorkspaceId FROM dbo.Workspaces WHERE Kind = N'ai-solutions' AND IsDeleted = 0);
    DECLARE @TemplateWorkspaceId UNIQUEIDENTIFIER =
        (SELECT TOP (1) WorkspaceId FROM dbo.Workspaces WHERE Kind = N'pg-dept-template' AND IsDeleted = 0);

    SELECT
        fd.FieldDefinitionId,
        CASE WHEN fd.WorkspaceId = @TemplateWorkspaceId THEN N'PG' ELSE N'AI' END AS Side,
        fd.FieldKey,
        fd.DisplayName,
        fd.FieldType
    FROM dbo.FieldDefinition AS fd
    WHERE fd.WorkspaceId IN (@TemplateWorkspaceId, @AiWorkspaceId)
      AND fd.ObjectType = N'Request'
      AND fd.IsDeleted = 0
      AND fd.IsRetired = 0
      AND fd.IsPlatformDefined = 0
      AND fd.FieldType NOT IN (N'Calculation', N'DerivedCategory')
      AND NOT EXISTS (
            SELECT 1 FROM dbo.CrossingMap AS cm
            WHERE cm.IsDeleted = 0
              AND (cm.PgFieldDefinitionId = fd.FieldDefinitionId OR cm.AiFieldDefinitionId = fd.FieldDefinitionId))
    ORDER BY Side, fd.DisplayName;
END;
GO

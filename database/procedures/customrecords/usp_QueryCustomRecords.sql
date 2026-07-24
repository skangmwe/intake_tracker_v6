-- =============================================
-- Author:      /dev-build-application (Slice 1b — Custom-object records: record CRUD API)
-- Create Date: 2026-07-24
-- Description: Returns a page of a custom object's records in a workspace, newest display-name first.
--              Each page row carries TotalCount = COUNT(*) OVER() (the full matching count, constant
--              across the page) so the caller builds the paginated envelope from a single result set.
--              Soft-deleted rows and rows of another workspace/object are excluded. FieldValues is
--              Confidential — never logged (api-pii-handling.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryCustomRecords
    @WorkspaceId        UNIQUEIDENTIFIER,
    @ObjectDefinitionId UNIQUEIDENTIFIER,
    @Page               INT,
    @PageSize           INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Obj  UNIQUEIDENTIFIER = @ObjectDefinitionId;
    DECLARE @Skip INT = (@Page - 1) * @PageSize;
    DECLARE @Take INT = @PageSize;

    SELECT r.RecordId,
           r.Name,
           r.FieldValues,
           r.RowVer,
           TotalCount = COUNT(*) OVER()
    FROM   dbo.CustomRecords r
    WHERE  r.WorkspaceId        = @Ws
      AND  r.ObjectDefinitionId = @Obj
      AND  r.IsDeleted          = 0
    ORDER  BY r.Name ASC, r.RecordId ASC
    OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
END;
GO

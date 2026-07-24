-- =============================================
-- Author:      /dev-build-application (Slice 1b — Custom-object records: record CRUD API)
-- Create Date: 2026-07-24
-- Description: Returns one custom-object record by id, scoped to its workspace AND object. No row is
--              returned when the record is soft-deleted or belongs to a different workspace/object —
--              the caller maps "no row" to 404 (never disclose existence, api-record-access.md).
--              FieldValues is Confidential — never logged (api-pii-handling.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetCustomRecordById
    @RecordId           UNIQUEIDENTIFIER,
    @WorkspaceId        UNIQUEIDENTIFIER,
    @ObjectDefinitionId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Id  UNIQUEIDENTIFIER = @RecordId;
    DECLARE @Ws  UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Obj UNIQUEIDENTIFIER = @ObjectDefinitionId;

    SELECT r.RecordId,
           r.ObjectDefinitionId,
           r.Name,
           r.FieldValues,
           r.RowVer,
           r.CreatedAt,
           r.UpdatedAt,
           r.CreatedBy
    FROM   dbo.CustomRecords r
    WHERE  r.RecordId           = @Id
      AND  r.WorkspaceId        = @Ws
      AND  r.ObjectDefinitionId = @Obj
      AND  r.IsDeleted          = 0;
END;
GO

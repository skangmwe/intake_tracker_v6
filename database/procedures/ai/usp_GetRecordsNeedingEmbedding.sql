-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 2 retrieval)
-- Create Date: 2026-07-25
-- Description: Returns the records in a workspace whose current allowlisted content has no stored
--              embedding, or whose content has changed since it was last embedded. The content and its
--              SHA-256 hash are computed HERE (server-side) from the workspace's AiContentFieldAllowlist
--              so the refresh sweep never re-derives the data-sensitivity policy — and so the hash that
--              decides "changed?" is always computed over the exact text that will be embedded.
--
--              The allowlist is a closed set of three non-PII intake fields (Name, Description,
--              WorkflowDetails — the only values AiContentAllowlist.Allowed permits), so each key maps to
--              a known source: Name/Description are real Request columns; WorkflowDetails is the
--              'workflowDetails' key in the FieldValues JSON map (JSON_VALUE caps a single value at 4000
--              chars — acceptable for short intake text). ObjectType is 'Request' this cycle; any other
--              type returns nothing.
--
--              Content is Confidential — never logged (api-pii-handling.md). Soft-deleted requests excluded.
--              Parameterized; header per database-stored-procedures.md.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetRecordsNeedingEmbedding
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Type NVARCHAR(64)     = @ObjectType;

    -- Only the Request object participates in retrieval this cycle.
    IF @Type <> N'Request'
        RETURN;

    DECLARE @Allow NVARCHAR(MAX) =
        (SELECT w.AiContentFieldAllowlist FROM dbo.Workspaces AS w WHERE w.WorkspaceId = @Ws AND w.IsDeleted = 0);

    -- Unknown / deleted workspace → no candidates (the caller only sweeps enabled workspaces, but fail closed).
    IF @Allow IS NULL
        RETURN;

    DECLARE @UseName BIT = CASE WHEN EXISTS (SELECT 1 FROM OPENJSON(@Allow) WHERE [value] = N'Name')            THEN 1 ELSE 0 END;
    DECLARE @UseDesc BIT = CASE WHEN EXISTS (SELECT 1 FROM OPENJSON(@Allow) WHERE [value] = N'Description')     THEN 1 ELSE 0 END;
    DECLARE @UseWf   BIT = CASE WHEN EXISTS (SELECT 1 FROM OPENJSON(@Allow) WHERE [value] = N'WorkflowDetails') THEN 1 ELSE 0 END;

    -- Build each request's allowlisted content in a fixed order, hash it once, and return only the rows
    -- whose hash has no match (or a stale match) in the embedding store.
    WITH Candidate AS (
        SELECT
            r.RecordId,
            LTRIM(RTRIM(CONCAT(
                CASE WHEN @UseName = 1 THEN CONCAT(N'Name: ', r.Name, NCHAR(10)) ELSE N'' END,
                CASE WHEN @UseDesc = 1 THEN CONCAT(N'Description: ', ISNULL(r.Description, N''), NCHAR(10)) ELSE N'' END,
                CASE WHEN @UseWf = 1 THEN CONCAT(N'Workflow Details: ', ISNULL(JSON_VALUE(r.FieldValues, N'$.workflowDetails'), N'')) ELSE N'' END
            ))) AS Content
        FROM dbo.Requests AS r
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
    ),
    Hashed AS (
        SELECT
            c.RecordId,
            c.Content,
            CONVERT(CHAR(64), HASHBYTES('SHA2_256', c.Content), 2) AS ContentHash
        FROM Candidate AS c
    )
    SELECT
        h.RecordId,
        h.ContentHash,
        h.Content
    FROM Hashed AS h
    LEFT JOIN dbo.RecordEmbedding AS e
        ON e.WorkspaceId = @Ws AND e.ObjectType = @Type AND e.RecordId = h.RecordId AND e.IsDeleted = 0
    WHERE e.EmbeddingId IS NULL
       OR e.ContentHash <> h.ContentHash;
END;
GO

-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: The Requests list read (S2). Returns a page of rows for a workspace plus the
--              total match count. Workspace membership is verified API-side by the access guard
--              before this runs, so the proc trusts @WorkspaceId scope; every filter value is
--              parameterised (via OPENJSON of @FiltersJson — never string-built) per
--              api-data-access.md. Sorting is column-whitelisted. Pagination via OFFSET/FETCH.
--
--              @FiltersJson (all keys optional):
--                { "stage": ["intake",..], "deptPgClient": ["Litigation",..],
--                  "analyst": ["Priya Raman",..], "priorityOp": ">"|">="|"<"|"<="|"=",
--                  "priorityValue": 5, "dueFrom": "2026-07-01", "dueTo": "2026-07-08",
--                  "nameContains": "extraction" }
--              @SortColumn ∈ {id,name,stage,origin,analyst,priority,due}; @SortDir ∈ {asc,desc}.
--              Two result sets: (1) the page rows, (2) a single-column TotalCount.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryRequests
    @WorkspaceId NVARCHAR(64),          -- passed as string; converted to the local guid
    @Page        INT,
    @PageSize    INT,
    @FiltersJson NVARCHAR(MAX)  = NULL,
    @SortColumn  NVARCHAR(32)   = N'due',
    @SortDir     NVARCHAR(4)    = N'asc'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws        UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, @WorkspaceId);
    -- The workspace's due-soon window (slice 21) — a single per-workspace constant returned on every
    -- page row so the API derives SLA Status against the configured window, not a hardcoded value.
    -- ISNULL guards the API's non-null Int32 read if the workspace row is somehow absent (default 3).
    DECLARE @DueSoonWindow INT = ISNULL((SELECT DueSoonWindowDays FROM dbo.Workspaces WHERE WorkspaceId = @Ws), 3);
    DECLARE @PageLocal INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size      INT = CASE WHEN @PageSize < 1 THEN 25 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @Filters   NVARCHAR(MAX)    = @FiltersJson;
    DECLARE @Sort      NVARCHAR(32)     = LOWER(ISNULL(@SortColumn, N'due'));
    DECLARE @Dir       NVARCHAR(4)      = CASE WHEN LOWER(ISNULL(@SortDir, N'asc')) = N'desc' THEN N'desc' ELSE N'asc' END;

    -- Scalar filter values (parameterised extraction from the JSON).
    DECLARE @PriorityOp    NVARCHAR(2)   = JSON_VALUE(@Filters, N'$.priorityOp');
    DECLARE @PriorityValue INT           = TRY_CONVERT(INT,  JSON_VALUE(@Filters, N'$.priorityValue'));
    DECLARE @DueFrom       DATE          = TRY_CONVERT(DATE, JSON_VALUE(@Filters, N'$.dueFrom'));
    DECLARE @DueTo         DATE          = TRY_CONVERT(DATE, JSON_VALUE(@Filters, N'$.dueTo'));
    DECLARE @NameContains  NVARCHAR(400) = JSON_VALUE(@Filters, N'$.nameContains');

    -- Multi-select filters into temp tables (empty table = filter not applied).
    DECLARE @Stages   TABLE (v NVARCHAR(64));
    DECLARE @Depts    TABLE (v NVARCHAR(200));
    DECLARE @Analysts TABLE (v NVARCHAR(200));

    IF @Filters IS NOT NULL AND ISJSON(@Filters) = 1
    BEGIN
        INSERT INTO @Stages (v)   SELECT value FROM OPENJSON(@Filters, N'$.stage');
        INSERT INTO @Depts (v)    SELECT value FROM OPENJSON(@Filters, N'$.deptPgClient');
        INSERT INTO @Analysts (v) SELECT value FROM OPENJSON(@Filters, N'$.analyst');
    END;

    DECLARE @HasStage   BIT = CASE WHEN EXISTS (SELECT 1 FROM @Stages)   THEN 1 ELSE 0 END;
    DECLARE @HasDept    BIT = CASE WHEN EXISTS (SELECT 1 FROM @Depts)    THEN 1 ELSE 0 END;
    DECLARE @HasAnalyst BIT = CASE WHEN EXISTS (SELECT 1 FROM @Analysts) THEN 1 ELSE 0 END;

    -- Matched set (reused by page + count) — a CTE-backed filter expression.
    ;WITH Matched AS (
        SELECT r.RecordId, r.Name, r.Description, r.Stage, r.Origin, r.DeptPgClient,
               r.AssignedAnalyst, r.DueDate, r.PriorityScore, r.Submitted, r.UpdatedAt, r.RowVer,
               r.StatusHold,   -- Slice 26 — drives the pill on each S2 row.
               -- Field-as-column rollup (slice 7): the first task-level URL field captured on this
               -- record surfaces as the Repo URL list column (blueprint). NULL when the record has
               -- no URL-type task field yet.
               (SELECT TOP 1 tk.FieldValueUrl
                FROM dbo.Tasks AS tk
                WHERE tk.RecordId = r.RecordId AND tk.WorkspaceId = r.WorkspaceId
                  AND tk.IsDeleted = 0 AND tk.FieldType = N'url' AND tk.FieldValueUrl IS NOT NULL
                ORDER BY tk.SortOrder ASC, tk.TaskId ASC) AS RepoUrl
        FROM dbo.Requests AS r
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
          AND (@HasStage = 0   OR r.Stage IN (SELECT v FROM @Stages))
          AND (@HasDept = 0    OR r.DeptPgClient IN (SELECT v FROM @Depts))
          AND (@HasAnalyst = 0 OR r.AssignedAnalyst IN (SELECT v FROM @Analysts))
          AND (@NameContains IS NULL OR r.Name LIKE N'%' + @NameContains + N'%')
          AND (@DueFrom IS NULL OR r.DueDate >= @DueFrom)
          AND (@DueTo   IS NULL OR r.DueDate <= @DueTo)
          AND (
                @PriorityOp IS NULL OR @PriorityValue IS NULL
                OR (@PriorityOp = N'>'  AND r.PriorityScore >  @PriorityValue)
                OR (@PriorityOp = N'>=' AND r.PriorityScore >= @PriorityValue)
                OR (@PriorityOp = N'<'  AND r.PriorityScore <  @PriorityValue)
                OR (@PriorityOp = N'<=' AND r.PriorityScore <= @PriorityValue)
                OR (@PriorityOp = N'='  AND r.PriorityScore =  @PriorityValue)
              )
    )
    SELECT
        m.RecordId, m.Name, m.Description, m.Stage, m.Origin, m.DeptPgClient,
        m.AssignedAnalyst, m.DueDate, m.PriorityScore, m.Submitted, m.UpdatedAt, m.RowVer, m.RepoUrl,
        m.StatusHold,   -- Slice 26 — the tri-state pill for the S2 row.
        @DueSoonWindow AS DueSoonWindowDays
    FROM Matched AS m
    ORDER BY
        CASE WHEN @Dir = N'asc'  AND @Sort = N'id'       THEN m.RecordId END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'id'       THEN m.RecordId END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'name'     THEN m.Name END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'name'     THEN m.Name END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'stage'    THEN m.Stage END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'stage'    THEN m.Stage END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'origin'   THEN m.DeptPgClient END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'origin'   THEN m.DeptPgClient END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'analyst'  THEN m.AssignedAnalyst END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'analyst'  THEN m.AssignedAnalyst END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'priority' THEN m.PriorityScore END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'priority' THEN m.PriorityScore END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'due'      THEN m.DueDate END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'due'      THEN m.DueDate END DESC,
        m.RecordId ASC   -- stable tiebreak
    OFFSET (@PageLocal - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;

    -- Second result set: total match count for pagination.
    ;WITH MatchedCount AS (
        SELECT r.RecordId
        FROM dbo.Requests AS r
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
          AND (@HasStage = 0   OR r.Stage IN (SELECT v FROM @Stages))
          AND (@HasDept = 0    OR r.DeptPgClient IN (SELECT v FROM @Depts))
          AND (@HasAnalyst = 0 OR r.AssignedAnalyst IN (SELECT v FROM @Analysts))
          AND (@NameContains IS NULL OR r.Name LIKE N'%' + @NameContains + N'%')
          AND (@DueFrom IS NULL OR r.DueDate >= @DueFrom)
          AND (@DueTo   IS NULL OR r.DueDate <= @DueTo)
          AND (
                @PriorityOp IS NULL OR @PriorityValue IS NULL
                OR (@PriorityOp = N'>'  AND r.PriorityScore >  @PriorityValue)
                OR (@PriorityOp = N'>=' AND r.PriorityScore >= @PriorityValue)
                OR (@PriorityOp = N'<'  AND r.PriorityScore <  @PriorityValue)
                OR (@PriorityOp = N'<=' AND r.PriorityScore <= @PriorityValue)
                OR (@PriorityOp = N'='  AND r.PriorityScore =  @PriorityValue)
              )
    )
    SELECT COUNT(*) AS TotalCount FROM MatchedCount;
END;
GO

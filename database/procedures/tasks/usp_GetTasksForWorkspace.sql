-- =============================================
-- Author:      task-export-fields (Task attributes — surface + export)
-- Create Date: 2026-07-23
-- Updated:     2026-07-24 (surface-fields slice 2) — added Created date, the creator's
--              resolved display name, and the captured typed field (label + coalesced value)
--              so the Task export surfaces every user-meaningful column (field-surfacing sweep).
-- Description: Returns every task in a workspace, paginated, for the Task CSV export
--              (S28 export wizard). One row per task with its parent Request id, phase,
--              status, notes, completed date, created date, the assignee's and creator's
--              display names (LEFT JOIN to dbo.Users so an unassigned / seeded task still
--              exports), and the single captured typed field — its label plus the one value
--              column that is set, coalesced to text (CK_Tasks_OneFieldValue guarantees at
--              most one is set). Ordered by parent record, then per-record sequence, then
--              TaskId as a stable tiebreak.
--
--              The creator join casts the audit actor (CreatedBy stores the actor GUID as a
--              string, 'system-seed' for seeded rows) via TRY_CAST, so a non-GUID actor
--              resolves to a null name rather than failing the read (mirrors the Attachment
--              export proc).
--
--              Access: this is NOT an access-gate proc. ExportService gates the caller's
--              Viewer membership on @WorkspaceId before calling into the export path
--              (api-record-access.md — the workspace scope IS the row-level entitlement;
--              export never widens access, BS §22.4). Soft-deleted tasks excluded. Titles
--              and notes are Confidential — never logged (api-pii-handling.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTasksForWorkspace
    @WorkspaceId UNIQUEIDENTIFIER,
    @Page        INT,
    @PageSize    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Skip INT = (@Page - 1) * @PageSize;
    DECLARE @Take INT = @PageSize;

    SELECT
        t.TaskId,
        t.RecordId,
        t.Title,
        t.Phase,
        t.Status,
        t.Notes,
        t.CompletedAt,
        t.CreatedAt,
        t.AssigneeUserId,
        assignee.DisplayName AS AssigneeName,
        creator.DisplayName  AS CreatedByName,
        t.FieldLabel,
        -- The one typed-field value column that is set, coalesced to text for the CSV cell.
        COALESCE(
            t.FieldValueUrl,
            t.FieldValueText,
            CONVERT(NVARCHAR(64), t.FieldValueNumber),
            CONVERT(NVARCHAR(10), t.FieldValueDate, 23),
            t.FieldValueSelect,
            CASE
                WHEN t.FieldValueBool IS NULL THEN NULL
                WHEN t.FieldValueBool = 1     THEN N'Yes'
                ELSE N'No'
            END) AS FieldValue
    FROM dbo.Tasks AS t
    LEFT JOIN dbo.Users AS assignee
        ON assignee.UserId = t.AssigneeUserId AND assignee.IsDeleted = 0
    LEFT JOIN dbo.Users AS creator
        ON creator.UserId = TRY_CAST(t.CreatedBy AS UNIQUEIDENTIFIER) AND creator.IsDeleted = 0
    WHERE t.WorkspaceId = @Ws
      AND t.IsDeleted = 0
    ORDER BY t.RecordId ASC, t.SortOrder ASC, t.TaskId ASC
    OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
END;
GO

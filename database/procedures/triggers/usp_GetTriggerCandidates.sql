-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.3)
-- Create Date: 2026-07-24
-- Description: Coarse candidate records for one 'Authored' trigger. Slice 1 supports the Request object
--              only: returns every OPEN request in the trigger's workspace (open = no closure outcome,
--              §17.2) with its full field-value map. The evaluator fine-checks the authored condition in
--              C# via the ConditionEngine. Built-in Task/Approval candidate branches and a targeted
--              date-column pre-filter are later slices.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTriggerCandidates
    @TriggerId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Trigger    UNIQUEIDENTIFIER = @TriggerId;
    DECLARE @Ws         UNIQUEIDENTIFIER;
    DECLARE @ObjectType NVARCHAR(64);

    SELECT @Ws = WorkspaceId, @ObjectType = ObjectType
    FROM dbo.ScheduledTrigger
    WHERE TriggerId = @Trigger AND IsDeleted = 0;

    IF @Ws IS NULL
        RETURN;

    IF @ObjectType = N'Request'
        SELECT r.RecordId, r.FieldValues AS FieldValuesJson
        FROM dbo.Requests AS r
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
          AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL;
END;
GO

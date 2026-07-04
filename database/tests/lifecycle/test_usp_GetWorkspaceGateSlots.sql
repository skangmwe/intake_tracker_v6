-- =============================================
-- tSQLt tests for dbo.usp_GetWorkspaceGateSlots (Slice 4 — Lifecycle & gates).
-- Covers: the live eligible-member count reflects the current roster and is scoped to the
-- workspace + role label.
-- =============================================

EXEC tSQLt.NewTestClass 'GetWorkspaceGateSlotsTests';
GO

CREATE PROCEDURE GetWorkspaceGateSlotsTests.[test_EligibleCountReflectsRoster]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateApproverSlot';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Gate UNIQUEIDENTIFIER = '6A7E0000-0000-4000-8000-000000000001';
    DECLARE @Stage UNIQUEIDENTIFIER = '57A60000-0000-4000-8000-000000000004';

    INSERT INTO dbo.GateDefinition (GateDefinitionId, WorkspaceId, LifecycleId, Name, FromStageId, ToStageId, JoinKind, SortOrder, IsDeleted)
    VALUES (@Gate, @Ws, NEWID(), N'QA gate', @Stage, @Stage, N'and', 0, 0);
    INSERT INTO dbo.GateApproverSlot (GateApproverSlotId, GateDefinitionId, RoleLabel, SlotIndex, IsDeleted)
    VALUES (NEWID(), @Gate, N'InfoSec', 0, 0);
    -- Two active InfoSec members in this workspace; one deleted; one in a different role.
    INSERT INTO dbo.ApproverTeamMembership (ApproverTeamMembershipId, WorkspaceId, RoleLabel, UserId, IsDeleted)
    VALUES (NEWID(), @Ws, N'InfoSec', NEWID(), 0),
           (NEWID(), @Ws, N'InfoSec', NEWID(), 0),
           (NEWID(), @Ws, N'InfoSec', NEWID(), 1),
           (NEWID(), @Ws, N'GCO',     NEWID(), 0);

    -- Act
    CREATE TABLE #Result (GateDefinitionId UNIQUEIDENTIFIER, RoleLabel NVARCHAR(120), SlotIndex INT, EligibleCount INT);
    INSERT INTO #Result EXEC dbo.usp_GetWorkspaceGateSlots @WorkspaceId = @Ws;

    -- Assert — only the two active InfoSec members count.
    DECLARE @Eligible INT = (SELECT EligibleCount FROM #Result WHERE RoleLabel = N'InfoSec');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Eligible;
END;
GO

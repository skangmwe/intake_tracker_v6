-- =============================================
-- tSQLt tests for dbo.usp_EmitAuditEntry (Slice 1 — Foundation).
-- Covers: record-scoped insert, null actor recorded as 'system', null RecordId
--         (workspace-level event) allowed. database-testing.md.
-- =============================================

EXEC tSQLt.NewTestClass 'EmitAuditEntryTests';
GO

CREATE PROCEDURE EmitAuditEntryTests.[test_InsertsRecordScopedEntry]
AS
BEGIN
    -- Arrange — FakeTable removes the append-only trigger so the row is observable.
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';

    -- Act
    EXEC dbo.usp_EmitAuditEntry
        @WorkspaceId  = '1A150000-0000-4000-8000-000000000001',
        @EventType    = N'request.created',
        @EventPayload = N'{"name":"x"}',
        @RecordId     = N'AIS-00000001',
        @ObjectType   = N'Request',
        @ActorUserId  = '22222222-2222-4222-8222-222222222222';

    -- Assert
    DECLARE @Cnt INT = (
        SELECT COUNT(*)
        FROM dbo.AuditEntry
        WHERE WorkspaceId = '1A150000-0000-4000-8000-000000000001'
          AND RecordId    = N'AIS-00000001'
          AND ObjectType  = N'Request'
          AND EventType   = N'request.created'
          AND ActorUserId = '22222222-2222-4222-8222-222222222222'
          AND EventPayload = N'{"name":"x"}'
          AND CreatedBy   = N'22222222-2222-4222-8222-222222222222'
    );
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Cnt;
END;
GO

CREATE PROCEDURE EmitAuditEntryTests.[test_NullActorRecordedAsSystem]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';

    -- Act — system-generated event: no actor.
    EXEC dbo.usp_EmitAuditEntry
        @WorkspaceId  = '1A150000-0000-4000-8000-000000000001',
        @EventType    = N'workspace.provisioned',
        @EventPayload = N'{}';

    -- Assert
    DECLARE @Actor NVARCHAR(256), @ActorId UNIQUEIDENTIFIER;
    SELECT @Actor = CreatedBy, @ActorId = ActorUserId FROM dbo.AuditEntry;
    EXEC tSQLt.AssertEquals @Expected = N'system', @Actual = @Actor;
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @ActorId;
END;
GO

CREATE PROCEDURE EmitAuditEntryTests.[test_NullRecordIdAllowed]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';

    -- Act — workspace-level event has no RecordId.
    EXEC dbo.usp_EmitAuditEntry
        @WorkspaceId  = '1A150000-0000-4000-8000-000000000001',
        @EventType    = N'field.updated',
        @EventPayload = N'{}';

    -- Assert
    DECLARE @Cnt INT = (SELECT COUNT(*) FROM dbo.AuditEntry WHERE RecordId IS NULL AND EventType = N'field.updated');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Cnt;
END;
GO

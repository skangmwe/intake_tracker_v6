-- =============================================
-- tSQLt tests for the append-only enforcement on dbo.AuditEntry (Slice 1).
-- FakeTable strips triggers, so ApplyTrigger reattaches the real
-- trg_AuditEntry_PreventMutation onto the faked table to exercise it in isolation.
-- Covers: INSERT allowed, UPDATE rejected, DELETE rejected (including a soft-delete
--         attempt). database-testing.md + database-coding-standards.md.
-- =============================================

EXEC tSQLt.NewTestClass 'AuditEntryImmutabilityTests';
GO

CREATE PROCEDURE AuditEntryImmutabilityTests.SetUp
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';
    EXEC tSQLt.ApplyTrigger @TableName = 'dbo.AuditEntry', @TriggerName = 'trg_AuditEntry_PreventMutation';
END;
GO

CREATE PROCEDURE AuditEntryImmutabilityTests.[test_InsertIsAllowed]
AS
BEGIN
    -- Act — an append is the only permitted write.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, EventType, EventAt, EventPayload, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'request.created', SYSUTCDATETIME(), N'{}', N'system', N'system');

    -- Assert
    DECLARE @Cnt INT = (SELECT COUNT(*) FROM dbo.AuditEntry);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Cnt;
END;
GO

CREATE PROCEDURE AuditEntryImmutabilityTests.[test_UpdateIsRejected]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, EventType, EventAt, EventPayload, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'request.created', SYSUTCDATETIME(), N'{}', N'system', N'system');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%append-only%';

    -- Act
    UPDATE dbo.AuditEntry SET EventType = N'tampered';
END;
GO

CREATE PROCEDURE AuditEntryImmutabilityTests.[test_DeleteIsRejected]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, EventType, EventAt, EventPayload, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'request.created', SYSUTCDATETIME(), N'{}', N'system', N'system');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%append-only%';

    -- Act
    DELETE FROM dbo.AuditEntry;
END;
GO

CREATE PROCEDURE AuditEntryImmutabilityTests.[test_SoftDeleteIsRejected]
AS
BEGIN
    -- Arrange — even flipping IsDeleted is an UPDATE and must be rejected.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, EventType, EventAt, EventPayload, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'request.created', SYSUTCDATETIME(), N'{}', N'system', N'system');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%append-only%';

    -- Act
    UPDATE dbo.AuditEntry SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME();
END;
GO

-- =============================================
-- tSQLt tests for the Ask conversation procs (Phase 4, Slice 3).
--   usp_CreateAiConversation   — inserts a thread owned by the caller.
--   usp_AppendAiMessage        — appends to an owned conversation; THROWs for a non-owner.
--   usp_GetAiConversation      — returns an owner's messages in order; THROWs for a non-owner (non-disclosure).
--   usp_SetAiMessageFeedback   — sets thumbs on an owned message; THROWs for a non-owner.
-- database-testing.md (AAA, FakeTable). AiConversation is faked with @Defaults = 1 so the ConversationId /
-- MessageId NEWID() and CreatedAt defaults still apply under the fake.
-- =============================================

EXEC tSQLt.NewTestClass 'AiConversationTests';
GO

CREATE PROCEDURE AiConversationTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.AiConversation', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.AiConversationMessage', @Defaults = 1;
END;
GO

CREATE PROCEDURE AiConversationTests.[test_CreateAiConversation_InsertsOwnedByUser]
AS
BEGIN
    -- Arrange
    DECLARE @Ws   UNIQUEIDENTIFIER = '2A150000-0000-4000-8000-000000000001';
    DECLARE @User UNIQUEIDENTIFIER = '2B150000-0000-4000-8000-000000000001';

    -- Act
    CREATE TABLE #New (ConversationId UNIQUEIDENTIFIER);
    INSERT INTO #New EXEC dbo.usp_CreateAiConversation
        @WorkspaceId = @Ws, @UserId = @User, @Title = N'Contract questions', @By = N'2B150000-0000-4000-8000-000000000001';

    -- Assert - exactly one owned row, carrying the caller's ids + title.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.AiConversation WHERE UserId = @User AND WorkspaceId = @Ws AND Title = N'Contract questions');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Returned INT = (SELECT COUNT(*) FROM #New);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Returned;
END;
GO

CREATE PROCEDURE AiConversationTests.[test_AppendAiMessage_InsertsOwnedMessage]
AS
BEGIN
    -- Arrange - a conversation owned by userA.
    DECLARE @Cid  UNIQUEIDENTIFIER = '2C150000-0000-4000-8000-000000000001';
    DECLARE @User UNIQUEIDENTIFIER = '2B150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.AiConversation (ConversationId, WorkspaceId, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Cid, '2A150000-0000-4000-8000-000000000001', @User, 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_AppendAiMessage
        @ConversationId = @Cid, @UserId = @User, @Role = N'user', @Content = N'Which requests mention retention?',
        @CitationsJson = NULL, @By = N'2B150000-0000-4000-8000-000000000001';

    -- Assert - one message on the conversation with the given content.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.AiConversationMessage WHERE ConversationId = @Cid AND Role = N'user' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE AiConversationTests.[test_AppendAiMessage_OtherUser_Throws]
AS
BEGIN
    -- Arrange - a conversation owned by userA.
    DECLARE @Cid   UNIQUEIDENTIFIER = '2C150000-0000-4000-8000-000000000001';
    DECLARE @UserA UNIQUEIDENTIFIER = '2B150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.AiConversation (ConversationId, WorkspaceId, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Cid, '2A150000-0000-4000-8000-000000000001', @UserA, 0, N'seed', N'seed');

    -- Assert - a different user cannot write into it.
    EXEC tSQLt.ExpectException;

    -- Act - userB attempts to append.
    EXEC dbo.usp_AppendAiMessage
        @ConversationId = @Cid, @UserId = '2B150000-0000-4000-8000-000000000099', @Role = N'user',
        @Content = N'Sneaky', @CitationsJson = NULL, @By = N'2B150000-0000-4000-8000-000000000099';
END;
GO

CREATE PROCEDURE AiConversationTests.[test_GetAiConversation_ReturnsOwnedMessagesInOrder]
AS
BEGIN
    -- Arrange - a conversation owned by userA with two messages at distinct times.
    DECLARE @Cid  UNIQUEIDENTIFIER = '2C150000-0000-4000-8000-000000000001';
    DECLARE @User UNIQUEIDENTIFIER = '2B150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.AiConversation (ConversationId, WorkspaceId, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Cid, '2A150000-0000-4000-8000-000000000001', @User, 0, N'seed', N'seed');
    INSERT INTO dbo.AiConversationMessage (MessageId, ConversationId, Role, Content, CreatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Cid, N'user',      N'Q', '2026-07-25T10:00:00', 0, N'seed', N'seed'),
           (NEWID(), @Cid, N'assistant', N'A', '2026-07-25T10:00:01', 0, N'seed', N'seed');

    -- Act - capture into an identity temp so the proc's ORDER BY is preserved into a sequence.
    CREATE TABLE #M (Seq INT IDENTITY(1,1), MessageId UNIQUEIDENTIFIER, Role NVARCHAR(16), Content NVARCHAR(MAX), CitationsJson NVARCHAR(MAX), Feedback NVARCHAR(16), CreatedAt DATETIME2);
    INSERT INTO #M (MessageId, Role, Content, CitationsJson, Feedback, CreatedAt)
        EXEC dbo.usp_GetAiConversation @ConversationId = @Cid, @UserId = @User;

    -- Assert - both rows, user turn first.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #M);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
    DECLARE @First NVARCHAR(16) = (SELECT Role FROM #M WHERE Seq = 1);
    EXEC tSQLt.AssertEquals @Expected = N'user', @Actual = @First;
END;
GO

CREATE PROCEDURE AiConversationTests.[test_GetAiConversation_OtherUser_Throws]
AS
BEGIN
    -- Arrange - a conversation owned by userA.
    DECLARE @Cid   UNIQUEIDENTIFIER = '2C150000-0000-4000-8000-000000000001';
    DECLARE @UserA UNIQUEIDENTIFIER = '2B150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.AiConversation (ConversationId, WorkspaceId, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Cid, '2A150000-0000-4000-8000-000000000001', @UserA, 0, N'seed', N'seed');

    -- Assert - another user is never shown the thread (non-disclosure).
    EXEC tSQLt.ExpectException;

    -- Act
    EXEC dbo.usp_GetAiConversation @ConversationId = @Cid, @UserId = '2B150000-0000-4000-8000-000000000099';
END;
GO

CREATE PROCEDURE AiConversationTests.[test_SetFeedback_UpdatesOwnedMessage]
AS
BEGIN
    -- Arrange - an owned conversation + assistant message.
    DECLARE @Cid  UNIQUEIDENTIFIER = '2C150000-0000-4000-8000-000000000001';
    DECLARE @Mid  UNIQUEIDENTIFIER = '2D150000-0000-4000-8000-000000000001';
    DECLARE @User UNIQUEIDENTIFIER = '2B150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.AiConversation (ConversationId, WorkspaceId, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Cid, '2A150000-0000-4000-8000-000000000001', @User, 0, N'seed', N'seed');
    INSERT INTO dbo.AiConversationMessage (MessageId, ConversationId, Role, Content, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Mid, @Cid, N'assistant', N'A', 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_SetAiMessageFeedback @MessageId = @Mid, @UserId = @User, @Feedback = N'up', @By = N'2B150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Vote NVARCHAR(16) = (SELECT Feedback FROM dbo.AiConversationMessage WHERE MessageId = @Mid);
    EXEC tSQLt.AssertEquals @Expected = N'up', @Actual = @Vote;
END;
GO

CREATE PROCEDURE AiConversationTests.[test_SetFeedback_OtherUser_Throws]
AS
BEGIN
    -- Arrange - an owned conversation + message.
    DECLARE @Cid   UNIQUEIDENTIFIER = '2C150000-0000-4000-8000-000000000001';
    DECLARE @Mid   UNIQUEIDENTIFIER = '2D150000-0000-4000-8000-000000000001';
    DECLARE @UserA UNIQUEIDENTIFIER = '2B150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.AiConversation (ConversationId, WorkspaceId, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Cid, '2A150000-0000-4000-8000-000000000001', @UserA, 0, N'seed', N'seed');
    INSERT INTO dbo.AiConversationMessage (MessageId, ConversationId, Role, Content, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Mid, @Cid, N'assistant', N'A', 0, N'seed', N'seed');

    -- Assert - another user cannot rate it.
    EXEC tSQLt.ExpectException;

    -- Act
    EXEC dbo.usp_SetAiMessageFeedback @MessageId = @Mid, @UserId = '2B150000-0000-4000-8000-000000000099', @Feedback = N'down', @By = N'2B150000-0000-4000-8000-000000000099';
END;
GO

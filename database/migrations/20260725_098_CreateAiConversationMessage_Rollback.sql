-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_098_CreateAiConversationMessage. Drops dbo.AiConversationMessage and its
--              migration-history row. Idempotent (IF EXISTS). This child drops before its parent
--              dbo.AiConversation (migration 097 rollback), so run this rollback first.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.AiConversationMessage', N'U') IS NOT NULL
    DROP TABLE dbo.AiConversationMessage;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_098_CreateAiConversationMessage';
GO

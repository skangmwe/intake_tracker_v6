-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_097_CreateAiConversation. Drops dbo.AiConversation and its migration-history
--              row. Idempotent (IF EXISTS). Drop the child dbo.AiConversationMessage (migration 098) FIRST — its
--              FK references this table — so run 098's rollback before this one.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.AiConversation', N'U') IS NOT NULL
    DROP TABLE dbo.AiConversation;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_097_CreateAiConversation';
GO

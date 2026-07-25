-- =============================================
-- Author:      Slice 4a — Task Due Date
-- Create Date: 2026-07-24
-- Description: Adds dbo.Tasks.DueDate — a nullable, date-only planning field the user sets, edits,
--              or clears on a Task. Modelled on CompletedAt (migration 033) but a plain DATE with no
--              default (a Task starts with no due date). Surfaced through the Task read/write procs,
--              entity, DTO, service, shared types, and UI. Idempotent per database-migrations.md
--              (COL_LENGTH guard).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Tasks', N'DueDate') IS NULL
    ALTER TABLE dbo.Tasks ADD DueDate DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_088_AddTaskDueDate')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260724_088_AddTaskDueDate', SUSER_SNAME(), N'Slice 4a — Task Due Date (nullable DATE on dbo.Tasks).');
END;
GO

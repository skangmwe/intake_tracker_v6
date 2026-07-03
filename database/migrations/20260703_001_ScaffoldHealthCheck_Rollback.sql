-- Rollback for 20260703_001_ScaffoldHealthCheck.sql.
-- Idempotent per database-migrations.md.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.MigrationHistory', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.MigrationHistory;
END;
GO

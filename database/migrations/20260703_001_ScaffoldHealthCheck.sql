-- =============================================
-- Author:      /dev-build-scaffold
-- Create Date: 2026-07-03
-- Description: Scaffold placeholder migration. Creates a MigrationHistory
--              table so slice 1 (Foundation) can record subsequent runs.
--              No feature schema. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.MigrationHistory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MigrationHistory
    (
        MigrationId    NVARCHAR(64)  NOT NULL,
        AppliedAt      DATETIME2     NOT NULL CONSTRAINT DF_MigrationHistory_AppliedAt DEFAULT SYSUTCDATETIME(),
        AppliedBy      NVARCHAR(256) NOT NULL,
        Description    NVARCHAR(512) NULL,
        CONSTRAINT PK_MigrationHistory PRIMARY KEY CLUSTERED (MigrationId)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_001_ScaffoldHealthCheck')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_001_ScaffoldHealthCheck', SUSER_SNAME(), N'Scaffold — MigrationHistory table only.');
END;
GO

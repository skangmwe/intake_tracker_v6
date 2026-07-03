# Database unit tests — templates and required cases

Companion to `/dev-unit-test-and-remediate` for `.sql` source files. Used in tandem with `.claude/rules/dev/database-testing.md`, which is the canonical source for tSQLt conventions, naming, and isolation rules.

This file holds: the object-type decision, the test-class scaffolding, per-object-type templates (stored procedure / ETL procedure / view / function), the required-case checklist, and common mechanical fixes.

---

## Decide test action for the in-scope object

| Object type | Source pattern | Test it? |
|---|---|---|
| Stored procedure | `usp_*.sql`, `sp_*.sql`, `dbo.usp_*` | Yes |
| ETL procedure | `etl_*.sql`, anything implementing MERGE/insert-update-deactivate logic | Yes — different required cases |
| View | `vw_*.sql`, `dbo.vw_*` | Yes |
| Scalar / table-valued function | `fn_*.sql`, `tvf_*.sql` | Yes |
| Migration script (one-off DDL) | `database/migrations/**` | Skip — covered by deployment, not unit-tested |
| Trigger | `trg_*.sql` | Yes — surface as a finding noting trigger tests need a real-row INSERT/UPDATE in the Arrange step |

---

## Test class scaffolding

Every object gets its own tSQLt test class (schema):

```sql
EXEC tSQLt.NewTestClass 'test_{{ObjectName}}';
GO
```

If the schema already exists, **extend** it. Never drop and recreate.

---

## Stored procedure template

```sql
CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_HappyPath_ReturnsExpectedResult]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable 'dbo.{{TableName}}';
    INSERT INTO dbo.{{TableName}} (Id, Column1, IsDeleted)
    VALUES (1, N'TestValue', 0);

    -- Act
    EXEC dbo.usp_{{ObjectName}} @Param1 = 1;

    -- Assert
    SELECT TOP 1 * INTO #Actual FROM dbo.{{TableName}};
    EXEC tSQLt.AssertEquals @Expected = N'TestValue', @Actual = (SELECT Column1 FROM #Actual);
END
GO

CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_NullInput_ReturnsEmpty]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.{{TableName}}';

    EXEC dbo.usp_{{ObjectName}} @Param1 = NULL;

    DECLARE @RowCount INT = (SELECT COUNT(*) FROM dbo.{{TableName}});
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @RowCount;
END
GO

CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_ErrorCondition_ThrowsExpectedException]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.{{TableName}}';
    EXEC tSQLt.ExpectException;

    EXEC dbo.usp_{{ObjectName}} @Param1 = -1;
END
GO
```

---

## ETL procedure template

```sql
CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_NewRecord_IsInserted]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.{{TargetTable}}';
    EXEC tSQLt.FakeTable 'staging.{{SourceTable}}';
    INSERT INTO staging.{{SourceTable}} (NaturalKey, Column1) VALUES (N'NEW', N'V1');

    EXEC dbo.etl_{{ObjectName}};

    DECLARE @RowCount INT = (SELECT COUNT(*) FROM dbo.{{TargetTable}} WHERE NaturalKey = N'NEW');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @RowCount;
END
GO

CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_ChangedRecord_IsUpdated]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.{{TargetTable}}';
    EXEC tSQLt.FakeTable 'staging.{{SourceTable}}';
    INSERT INTO dbo.{{TargetTable}} (NaturalKey, Column1, IsActive) VALUES (N'EX', N'OLD', 1);
    INSERT INTO staging.{{SourceTable}} (NaturalKey, Column1) VALUES (N'EX', N'NEW');

    EXEC dbo.etl_{{ObjectName}};

    DECLARE @Value NVARCHAR(50) = (SELECT Column1 FROM dbo.{{TargetTable}} WHERE NaturalKey = N'EX');
    EXEC tSQLt.AssertEqualsString @Expected = N'NEW', @Actual = @Value;
END
GO

CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_RemovedRecord_IsDeactivated]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.{{TargetTable}}';
    EXEC tSQLt.FakeTable 'staging.{{SourceTable}}';
    INSERT INTO dbo.{{TargetTable}} (NaturalKey, IsActive) VALUES (N'GONE', 1);

    EXEC dbo.etl_{{ObjectName}};

    DECLARE @IsActive BIT = (SELECT IsActive FROM dbo.{{TargetTable}} WHERE NaturalKey = N'GONE');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @IsActive;
END
GO
```

---

## View template

```sql
CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_ReturnsCorrectColumns_ExcludesDeleted]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.{{BaseTable}}';
    INSERT INTO dbo.{{BaseTable}} (Id, Column1, IsDeleted)
    VALUES (1, N'Active', 0), (2, N'Deleted', 1);

    SELECT * INTO #Actual FROM dbo.vw_{{ObjectName}};

    DECLARE @RowCount INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @RowCount;
END
GO
```

---

## Required case checklist

Per `database-testing.md`:

| Object type | Required cases |
|---|---|
| Stored procedure | Happy path, NULL/empty input, expected error condition |
| ETL procedure | New record insert, changed record update, deactivation of removed records |
| View | Correct columns returned, filters applied (especially `IsDeleted`/`IsActive`) |
| Function | Happy path, NULL input, boundary values |

A test class missing any required case for its object type is a **Mechanical/High** finding — auto-fix by adding the missing case from the matching template.

---

## Isolation rules (assert before fixing)

- Every test must `EXEC tSQLt.FakeTable` before inserting test data — tests must never touch real tables.
- Calls to dependent procedures must be intercepted with `EXEC tSQLt.SpyProcedure 'dbo.dependent_proc'` so we test one object at a time.
- Every test must contain at least one `tSQLt.AssertEquals` / `AssertEqualsTable` / `ExpectException`. A test with zero assertions is a **Mechanical/High** finding — auto-fix by adding the appropriate assertion against the AAA pattern.

---

## Common mechanical fixes (auto-applied)

| Failure / gap | Fix |
|---|---|
| Test inserts into a real table without `tSQLt.FakeTable` first | Add the `FakeTable` call before the `INSERT`. |
| Test calls a dependent procedure for real instead of spying it | Add `EXEC tSQLt.SpyProcedure 'dbo.<dep>';` in Arrange. |
| Test has no assertion | Add `tSQLt.AssertEquals` against the post-Act state, or `tSQLt.ExpectException` if testing an error path. |
| ETL test only covers insert | Add the changed-record and deactivation cases from the template. |
| View test asserts row count but not column shape | Add `tSQLt.AssertEqualsTable` against an `#Expected` table. |
| Test class named `<ObjectName>_Tests` instead of `test_<ObjectName>` | Rename the schema. |

---

## When a test surfaces a source bug

If a correctly-written test fails because the procedure has a real bug, route through `.claude/skills/dev-remediation/database-backend-remediation-logic.md` (or `database-security-remediation-logic.md` for SQL-injection / privilege findings) for the source-side fix. Apply, re-read, re-run via `tSQLt.RunAll`, log under `remediations-applied/<label>.md`.

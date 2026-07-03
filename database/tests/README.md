# tSQLt tests

Every stored procedure, function, and view must have tSQLt tests before it is considered complete per `database-testing.md`.

## Structure

- One test class per schema/module: `test.RequestsProcedures`, `test.EscalationProcedures`, etc.
- Tests named `test_<scenario>` and follow Arrange / Act / Assert.
- Use `tSQLt.FakeTable` to isolate; never touch real data.

Slice authors add tests alongside their SQL objects.

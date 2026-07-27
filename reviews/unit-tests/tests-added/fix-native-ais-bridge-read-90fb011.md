# fix-native-ais-bridge-read-90fb011 — tests added

## Iteration 1
- database/tests/requests/test_Escalation.sql :: EscalationTests.test_GetBridgeEmptyForNativeAiRecord
  Regression guard: a native ai-solutions request (no PG side) must return ZERO bridge rows.
  Runs in CI (tSQLt not vendored locally).

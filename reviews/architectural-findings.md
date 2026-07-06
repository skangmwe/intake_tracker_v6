# Architectural findings ledger

Append-only. Every architectural finding that has surfaced, with the developer's decision. Unit-test findings use the `unit-test/` match-key prefix.

| Match Key | First Seen | Status | Decided At | Rule | File | Reason |
|-----------|------------|--------|------------|------|------|--------|
| unit-test/web::web-testing.md#coverage-floor | 2026-07-06 | Accepted | 2026-07-06 | coverage-floor | web (global) | Pre-existing debt from slices 1–14 (slices 15 & 16 shipped at the same 76%/77% level, accepted as pre-existing). Slice-17 files sit above the global average, so they can only raise the global. Raising the whole project to floor is cross-slice debt, out of scope for slice 17. Developer accepted + authorized ship. |

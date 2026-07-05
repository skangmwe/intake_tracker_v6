# slice-attachments-d4067b7 — remediations applied

## Iteration 1

| Phase | File | Change | Class |
|-------|------|--------|-------|
| 0 | web/src/features/attachments/api.test.ts | Added direct wrapper tests (path/method/body) → `api.ts` 100% | Coverage gap-fill |
| 0 | web/src/features/attachments/AttachmentsCard.test.tsx | Added in-flight-upload + failed-download branch tests | Coverage gap-fill |
| 0 | web/src/features/attachments/useAttachments.test.tsx | Added disabled-query-key + link-without-url branch tests | Coverage gap-fill |
| 1 | web/src/features/attachments/attachments.css | Spinner colour `--color-teal` → `--accent-interactive` (finding #1) | Mechanical (design rule) |

All changes re-verified: attachments jest suites green after the fixes.

# escalation

Slice 9 — Escalate modal (S18) + the escalated-record surface (S5, prototyped).

- `EscalateModal` — the confirm-and-lock dialog (focus-trapped, Escape/scrim close). Sends
  `confirmPendingEdits=true`; on success the record query invalidates and refetches into the
  escalated variant.
- `EscalatedIntakeNote` — the slim mirror note at the top of the Intake tab (origin, mirror status,
  crossed-fields-locked-on-PG, Deploy/Post-launch → "Deployed").
- `useEscalate` — the escalate mutation; invalidates the record + lists on success.
- `api.ts` — `escalateRequest(recordId, { confirmPendingEdits })`.

The Record detail page (features/requests) consumes `EscalateModal` + `EscalatedIntakeNote` and
renders the "Escalated · [origin]" header pill + the pale-gold "⇄ Crossed · locked on PG" markers
(disabled on the PG side, editable on the AI side). Public exports go through `index.ts`.

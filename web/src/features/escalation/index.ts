// Public API of the escalation feature (S18 Escalate modal + the escalate mutation). Consumed by the
// Record detail page (features/requests) to escalate a PG-side Request and render the S5 variant.
export { EscalateModal } from './EscalateModal';
export { EscalatedIntakeNote } from './EscalatedIntakeNote';
export { useEscalate } from './useEscalate';

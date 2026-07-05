// Public API of the gates feature (web-file-structure.md — import via this barrel only).

export { GateBlock } from './GateBlock';
export { approvalRequestsKey, useApprovalRequests, useReRequest, useSubmitDecision } from './useGates';
export { gatePhaseLabel } from './gateView';

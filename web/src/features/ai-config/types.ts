// Workspace AI-assist configuration types (Phase 4, §14). Mirrors AiConfigController's DTOs. The
// content-field allowlist is the data-sensitivity floor: only the closed non-PII set is ever eligible.

export interface AiConfig {
  enabled: boolean;
  contentFieldAllowlist: string[];
}

export interface AiConfigUpdateRequest {
  enabled: boolean;
  contentFieldAllowlist: string[];
}

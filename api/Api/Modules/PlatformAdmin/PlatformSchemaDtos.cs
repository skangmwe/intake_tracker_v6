// Platform Fields & objects — Objects / Relationships tab DTOs (S34, B2). The Objects and
// Relationships tabs reuse the existing ObjectDefinitionDto (Modules.Objects) and RelationshipDto
// (Modules.Relationships); the only new shape is the workspace picker row below. Property names are
// PascalCase records serialized camelCase (web default) and align with shared/types PlatformWorkspaceDto.

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

/// <summary>One workspace in the platform-admin workspace picker (S34 Relationships tab). Firm-wide
/// list every workspace so, unlike a membership row, it carries no per-caller access level.</summary>
public sealed record PlatformWorkspaceDto(Guid Id, string Name, string Kind);

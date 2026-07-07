# Shared Types — Index

*Human-readable index of the vocabulary at `/shared/types/`. Both `web/` and `api/` consume these types; `api/` via `System.Text.Json` deserialization against the same shapes (the compilation target for the C# side lives in `api/Shared/Types/` and is generated from these `.ts` files at build time; the TypeScript files here are the source of truth for the wire vocabulary).*

## Files

| File | Owns |
|---|---|
| [`common.ts`](../../../../shared/types/common.ts) | Branded identifiers (`RecordId`, `WorkspaceId`, `UserId`, …). Pagination envelope. ProblemDetails. Filter clauses. `AccessLevel`, `WorkspaceKind`, `ObjectType`. Firm error codes. |
| [`identity.ts`](../../../../shared/types/identity.ts) | `UserDto`, `MeDto`, `WorkspaceMembershipDto`, `WorkspaceDto`, `WorkspaceProvisionRequest`, `MembershipUpsertRequest`, `WorkspaceMemberDto`, `MembersListDto` (S29, slice 17). |
| [`fields.ts`](../../../../shared/types/fields.ts) | Field-schema vocabulary (S30/S34): `FieldType`/`FieldCategory`/`FieldObjectType`, `FieldDefinitionDto`, `SelectOptionDto`, `FieldRuleDto`, `DerivedFieldDto`, `WorkspaceFieldSchemaDto`, `PlatformFieldDto`, `TaskLibraryFieldDto`, upsert/patch requests, `FieldRuleGraphValidationResult`. |
| [`requests.ts`](../../../../shared/types/requests.ts) | `RequestDto`, `RequestListRow`, `RequestCreateRequest`, `RequestPatchRequest`, `StageTransitionRequest`, `EscalateRequest`, `EscalateResult`, `RequestCloseRequest`, `Outcome` (`DeliveryOutcome` \| `LocalOutcome`), `SlaStatus`, `BridgeBlock`. |
| [`tasks.ts`](../../../../shared/types/tasks.ts) | `TaskDto`, `TaskStatus`, `TaskPhase`, `TaskTypedField(Value)`, `TaskCreateRequest` (single \| bundle), `TaskPatchRequest`, `TaskBundleTemplate`. |
| [`gates.ts`](../../../../shared/types/gates.ts) | Approvals: `ApprovalRequestDto`, `FrozenApproverSlot` (carries `eligibleMembers: ApproverTeamMemberDto[]` — the frozen name-picker roster, slice 8), `ApprovalDecisionDto` (adds `decidedByName` + `superseded` for the approval/rejection lines, slice 8), `ApprovalDecisionRequest`, `ReRequestApprovalRequest`, `ProxyApprovalDecisionRequest`, `SlotDecision`. S31 config: `LifecycleConfigDto`, `LifecycleDto`, `StageDefinitionDto`, `StatusCategory`, `GateDefinitionDto`, `ApproverTeamDto`, `ApproverTeamMemberDto`, and the `*UpsertDto` / `ApproverTeam*Request` bodies. |
| [`features.ts`](../../../../shared/types/features.ts) | `FeatureDto`, `FeatureListRow`, `FeatureCreateRequest`, `FeatureMaturity`, `FeatureType`. |
| [`collaboration.ts`](../../../../shared/types/collaboration.ts) | `CommentDto`, `CommentCreateRequest`, `TypedLinkDto` (+ access-respecting `toName`/`toStage` for the Relationships card, slice 10), `TypedLinkCreateRequest`, `TypedLinkKind`, `LinkBackKind`, `QueuedLink` (slice 10), `AttachmentDto`, `WatcherDto`, `WatcherListItemDto` + `WatcherListDto` (Watchers card + toggle state, slice 12), `ActivityThreadItem`, `AuditEventItem`, `CopyRequest`, `CopyResult` (slice 10). |
| [`announcements.ts`](../../../../shared/types/announcements.ts) | `AnnouncementDto`, `AnnouncementCreateRequest`, `AnnouncementListRow`, `AnnouncementStatus`, `AnnouncementAudience`. |
| [`notifications.ts`](../../../../shared/types/notifications.ts) | `EventEnvelope`, `EventType`, `NotificationDto`, `NotificationCategory`, `NotificationQuery` + `UnreadCountDto` (bell feed + badge, slice 12), `SearchHitDto`, `SearchResultDto`, `SavedViewDto`, `SavedViewUpsertRequest`. *(Home types moved to `home.ts` (slice 22); dashboard types moved to `dashboards.ts` (slice 23).)* |
| [`dashboards.ts`](../../../../shared/types/dashboards.ts) | Dashboards (S6/S12/S14/S15/S16/S17 + S32, slice 23, BS §10.2-§10.5): `WidgetType` (8-type palette), `DashboardMetric`, `DashboardWidgetConfig`, `DashboardDrillFilter`, the per-widget `data` shapes (`KpiTileData`, `KpiTrendData`, `SegmentedBarData`, `BarBreakdownData`, `HistogramData`, `TimeSeriesData`, `HeatmapMatrixData`, `RecordsGridData` + `WidgetSegment`/`HeatmapColumn`/`DashboardGridRow`), `DashboardWidgetDto`, `SavedDashboardDto`, `DashboardListItemDto`/`DashboardListDto`, `DashboardPatchRequest`, `DashboardSlug`. Widget `data: unknown` is narrowed by widget `type`. |
| [`home.ts`](../../../../shared/types/home.ts) | Home surface (S1, slice 22, BS §10.7): `HomeDto` + the five panel item shapes — `HomeDecisionItem`, `HomeWorkItem` (reuses `SlaStatus`), `HomeActivityItem`, `HomeTriageItem`, `HomePinnedAnnouncement`. Replaces the scaffold's placeholder Home types formerly in `notifications.ts`. |
| [`imports.ts`](../../../../shared/types/imports.ts) | `ImportStatusDto`, `ImportFlaggedRow`, `ExportRequest`, `ImportStatus`. |
| [`audit.ts`](../../../../shared/types/audit.ts) | Audit-log surfaces (S33 workspace audit, slice 18; S39 firm-wide, slice 19): `AuditLogRowDto`, `AuditLogQuery`. Read-only projection of the append-only `AuditEntry`; distinct from `collaboration.ts`'s per-record `AuditEventItem`. |
| [`platform.ts`](../../../../shared/types/platform.ts) | Platform-admin surfaces (S35–S39, slice 19): `CrossingMapRowDto` (S35, read-only); `RoleLabelDto` + `RoleLabel{Create,Rename}Request` (S37); `PrivilegedGrantKind`/`PrivilegedGrantDto`/`PrivilegedGrantsListDto` + `PlatformAdminGrantRequest` (S36); `WorkspaceProvisionResult` (S38); `FirmWideAuditRowDto`/`FirmWideAuditQuery` (S39, extend the `audit.ts` shapes). |
| [`index.ts`](../../../../shared/types/index.ts) | Barrel export. |

## Conventions

- **Branded string identifiers.** All GUIDs and the `PREFIX-NNNNNNNN` Record ID are branded strings — the type system prevents mixing a `UserId` with a `RecordId`, even though both are strings at runtime. C# side mirrors this by wrapping each in a `readonly record struct`.
- **DTOs never contain PII in identifiers.** `UserId` is the Entra `oid` — the only user identifier permitted in logs (`api-logging.md`). Never encode `displayName`, `email`, or matter references into an identifier.
- **Sparse PATCH shape.** Every PATCH DTO omits fields the caller doesn't want to change. Server-side, we bind to a nullable-property shape and skip null properties.
- **ETag / optimistic concurrency.** `RequestDto` carries an `eTag`; PATCH requires `ifMatch`. A stale token returns `409 stale-record`. Applies to every mutable content-bearing record.
- **Discriminated unions.** `Outcome` uses `kind: 'delivery' | 'local'`. `TaskCreateRequest` uses `kind: 'single' | 'bundle'`. `TaskTypedFieldValue` uses `kind: 'url' | 'text' | 'number' | 'date' | 'select' | 'checkbox'`. `ActivityThreadItem` uses `kind: 'comment' | 'event'`. `FilterClause` uses `kind: …`. The API's `JsonStringEnumConverter` per `api-coding-standards.md` renders these as strings on the wire.
- **Enums serialize as strings.** Per `api-coding-standards.md` JsonSerializerOptions rule — `Stage`, `Outcome.kind`, `SlotDecision`, `TaskStatus`, etc. are all strings on the wire.

## What isn't in shared types (and why)

- **Field values inside a Request.** The Request's `fields: Record<string, unknown>` is deliberately unstructured — field schemas are workspace-configurable (S30). Runtime validation happens against the stored `FieldDefinition` set; compile-time typing would require per-workspace codegen and would defeat the configurability.
- **Widget-config schemas.** `DashboardWidgetDto.config` is `Record<string, unknown>` — validated at the widget-type layer, not at the wire.
- **Full audit-event payloads.** `EventEnvelope.payload` is `Record<string, unknown>`. Per-event-type payload validation lives with each event emitter, not in the shared types.

Any of these could be tightened later once the fields, widget configs, or event payloads are stable. Doing it prematurely would over-couple the wire format to per-workspace configuration.

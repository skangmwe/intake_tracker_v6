// Shared test helpers (web-testing.md — recurring setup used by 3+ files lives here).
// renderWithProviders wraps a UI in the app's providers (query + auth + router) and lets a
// test seed the /users/me query so shell components render without hitting the network.

import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import type {
  ApprovalRequestDto,
  ApprovalRequestId,
  FieldDefinitionDto,
  GateDefinitionId,
  LifecycleConfigDto,
  LifecycleId,
  LifecycleSummaryDto,
  MeDto,
  ObjectDefinitionDto,
  PlatformFieldDto,
  RecordId,
  RelationshipDto,
  RelationshipId,
  RelationshipLinkDto,
  RequestDto,
  RequestListRow,
  StageDefinitionId,
  TypedLinkDto,
  TypedLinkId,
  UserId,
  WorkspaceId,
  WorkspaceMemberDto,
  WorkspaceMembershipDto,
} from '@shared/types';

import { AuthContext, type AuthContextValue } from '@/shared/auth/authContext';
import { ME_QUERY_KEY } from '@/features/users/useMe';

export function buildAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    isAuthenticated: true,
    user: { name: 'Priya Raman', username: 'priya@mws.ai', initials: 'PR' },
    logout: jest.fn(),
    ...overrides,
  };
}

export function buildMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    user: {
      // Branded ID types are compile-time only; cast string fixtures to satisfy them.
      id: '00000000-0000-0000-0000-000000000001' as UserId,
      displayName: 'Priya Raman',
      email: 'priya@mws.ai',
      lastSignInAt: '2026-07-03T13:00:00Z',
      isDisabled: false,
      theme: 'light',
    },
    memberships: [],
    isPlatformAdmin: false,
    ...overrides,
  };
}

export function buildMembership(
  overrides: Partial<WorkspaceMembershipDto> = {},
): WorkspaceMembershipDto {
  return {
    workspaceId: 'ws-1' as WorkspaceId,
    workspaceName: 'AI Solutions',
    workspaceKind: 'ai-solutions',
    workspacePrefix: 'AIS',
    level: 'Member',
    isDashboardViewer: false,
    ...overrides,
  };
}

export function buildFieldDefinition(
  overrides: Partial<FieldDefinitionDto> = {},
): FieldDefinitionDto {
  return {
    id: '00000000-0000-0000-0000-0000000000f1' as FieldDefinitionDto['id'],
    workspaceId: 'ws-1' as WorkspaceId,
    objectType: 'Request',
    fieldKey: 'name',
    displayName: 'Name',
    fieldType: 'ShortText',
    category: 'Crossing',
    section: 'Intake',
    helpText: null,
    isRequired: true,
    isReadOnly: false,
    isPlatformDefined: false,
    platformFieldKey: null,
    visibleStages: null,
    crossingToFieldKey: null,
    minValue: null,
    maxValue: null,
    allowNewValues: false,
    sortOrder: 1,
    isRetired: false,
    options: [],
    rules: [],
    derived: null,
    createdAt: '2026-07-03T13:00:00Z',
    updatedAt: '2026-07-03T13:00:00Z',
    ...overrides,
  };
}

export function buildPlatformField(overrides: Partial<PlatformFieldDto> = {}): PlatformFieldDto {
  return {
    id: '00000000-0000-0000-0000-0000000000p1' as PlatformFieldDto['id'],
    fieldKey: 'legacy-id',
    displayName: 'Legacy ID',
    fieldType: 'Text',
    category: 'Platform',
    isSystemImmutable: false,
    hasManualWritePath: true,
    selectOptions: null,
    ...overrides,
  };
}

/** A seeded S31 config: one default "Standard" lifecycle (execution → validation) with a gate + roster. */
export function buildLifecycleConfig(
  overrides: Partial<LifecycleConfigDto> = {},
): LifecycleConfigDto {
  const executionStage = '00000000-0000-0000-0000-0000000000b1' as StageDefinitionId;
  const validationStage = '00000000-0000-0000-0000-0000000000b2' as StageDefinitionId;
  return {
    workspaceId: 'ws-1' as WorkspaceId,
    lifecycles: [
      {
        id: '00000000-0000-0000-0000-00000000010c' as LifecycleId,
        name: 'Standard',
        requestType: 'Full build',
        isDefault: true,
        sortOrder: 0,
        stages: [
          {
            id: executionStage,
            key: 'execution',
            label: 'Execution',
            statusCategory: 'Execution',
            sortOrder: 0,
          },
          {
            id: validationStage,
            key: 'validation',
            label: 'Validation',
            statusCategory: 'Validation',
            sortOrder: 1,
          },
        ],
        gates: [
          {
            id: '00000000-0000-0000-0000-0000000001a1' as GateDefinitionId,
            lifecycleId: '00000000-0000-0000-0000-00000000010c' as LifecycleId,
            name: 'QA readiness gate',
            fromStageId: executionStage,
            toStageId: validationStage,
            joinKind: 'and',
            slots: [{ roleLabel: 'InfoSec', eligibleCount: 2 }],
          },
        ],
      },
    ],
    roleLabels: ['InfoSec', 'AI Solutions Manager'],
    approverTeams: [
      {
        roleLabel: 'InfoSec',
        members: [
          { userId: '00000000-0000-0000-0000-0000000000a1' as UserId, displayName: 'N. Varga' },
        ],
      },
      { roleLabel: 'AI Solutions Manager', members: [] },
    ],
    ...overrides,
  };
}

/**
 * A lightweight lifecycle summary for the S3 intake picker + S31 dropdown (v2, slice 27).
 * Defaults to the default "Standard" lifecycle; matches buildLifecycleConfig's default id.
 */
export function buildLifecycleSummary(
  overrides: Partial<LifecycleSummaryDto> = {},
): LifecycleSummaryDto {
  return {
    id: '00000000-0000-0000-0000-00000000010c' as LifecycleId,
    name: 'Standard',
    isDefault: true,
    ...overrides,
  };
}

/** A full Request record (S4). Defaults to a non-escalated AI-workspace record at the Intake stage. */
export function buildRequestDto(overrides: Partial<RequestDto> = {}): RequestDto {
  return {
    id: 'AIS-00000001' as RecordId,
    workspaceId: 'ws-1' as WorkspaceId,
    origin: 'AI Solutions',
    createdAt: '2026-07-03T13:00:00Z',
    updatedAt: '2026-07-03T13:00:00Z',
    createdBy: '00000000-0000-0000-0000-000000000001' as UserId,
    updatedBy: '00000000-0000-0000-0000-000000000001' as UserId,
    lifecycleId: '00000000-0000-0000-0000-00000000010c' as LifecycleId,
    stages: [
      { key: 'intake', label: 'Intake' },
      { key: 'triage', label: 'Triage' },
      { key: 'execution', label: 'Execution' },
      { key: 'validation', label: 'Validation' },
      { key: 'delivery', label: 'Delivery' },
      { key: 'stabilization', label: 'Stabilization' },
      { key: 'closure', label: 'Closure' },
    ],
    stage: 'intake',
    hold: { held: false },
    displayStatus: 'Intake',
    name: 'Meeting-notes action extraction',
    description: 'Pull action items and owners out of recorded matter-team meetings.',
    fields: { deptPgClient: 'AI Solutions', businessValue: 4, efficiencyGain: 3, levelOfEffort: 2 },
    eTag: 'AAAAAAAAAGQ=',
    ...overrides,
  };
}

/** A row on the Requests list (S2). Columns mirror the projected grid values. */
export function buildRequestListRow(overrides: Partial<RequestListRow> = {}): RequestListRow {
  return {
    id: 'AIS-00000001' as RecordId,
    eTag: 'AAAAAAAAAGQ=',
    columns: {
      id: 'AIS-00000001',
      name: 'Meeting-notes action extraction',
      desc: 'Pull action items out of matter-team meetings.',
      stage: 'intake',
      origin: 'AI Solutions',
      analyst: 'Priya Raman',
      priority: 5,
      due: '2026-07-16',
    },
    slaStatus: 'OnTrack',
    ...overrides,
  };
}

/**
 * An open, single-slot gate (GCO) with one eligible member — the default the gate tests start from.
 * Override `state` / `decisions` / `slots` to reach the approved / rejected / resolved / empty-roster
 * variants.
 */
export function buildApprovalRequest(
  overrides: Partial<ApprovalRequestDto> = {},
): ApprovalRequestDto {
  return {
    id: 'gate-1' as ApprovalRequestId,
    requestRecordId: 'AIS-00000001' as RecordId,
    gateDefinitionId: '6A7E0000-0000-4000-8000-000000000001' as GateDefinitionId,
    gateName: 'QA readiness gate',
    fromStage: 'Execution',
    toStage: 'Validation',
    state: 'Pending',
    openedAt: '2026-07-04T18:00:00Z',
    slots: [
      {
        slotIndex: 0,
        roleLabel: 'GCO',
        displayLabel: 'GCO',
        eligibleMembers: [{ userId: 'user-casey' as UserId, displayName: 'Casey Okafor' }],
      },
    ],
    decisions: [],
    ...overrides,
  };
}

/** A resolved typed link for the Relationships card (S4/S5). Far side visible by default. */
export function buildTypedLink(overrides: Partial<TypedLinkDto> = {}): TypedLinkDto {
  return {
    id: '00000000-0000-0000-0000-0000000000e1' as TypedLinkId,
    fromRecordId: 'AIS-00000001' as RecordId,
    toRecordId: 'AIS-00000002' as RecordId,
    kind: 'related',
    toName: 'Summariser',
    toStage: 'validation',
    createdAt: '2026-07-04T10:00:00Z',
    ...overrides,
  };
}

/**
 * A Relationship definition — defaults to a workspace-authored (non-system) Request → Task
 * OneToMany relationship that surfaces as a "Tasks" tab on the From side. Override any field
 * for the retire / restore / system-lock / cardinality variants.
 */
export function buildRelationship(overrides: Partial<RelationshipDto> = {}): RelationshipDto {
  return {
    id: '00000000-0000-0000-0000-0000000000r1' as RelationshipId,
    workspaceId: 'ws-1' as WorkspaceId,
    name: 'Request has Tasks',
    fromObjectType: 'Request',
    toObjectType: 'Task',
    cardinality: 'OneToMany',
    fromSideLabel: 'Tasks',
    toSideLabel: 'Request',
    showOnFromAsTab: true,
    tabLabel: 'Tasks',
    sortOrder: 0,
    isRetired: false,
    isSystem: false,
    createdAt: '2026-07-16T13:00:00Z',
    updatedAt: '2026-07-16T13:00:00Z',
    createdBy: '00000000-0000-0000-0000-000000000001' as UserId,
    updatedBy: '00000000-0000-0000-0000-000000000001' as UserId,
    ...overrides,
  };
}

/** One relationship-driven link row (S4/S5 side panel + relationship-driven tab). */
export function buildRelationshipLink(
  overrides: Partial<RelationshipLinkDto> = {},
): RelationshipLinkDto {
  return {
    id: '00000000-0000-0000-0000-0000000000l1',
    relationshipId: '00000000-0000-0000-0000-0000000000r1' as RelationshipId,
    fromRecordId: 'AIS-00000001' as RecordId,
    toRecordId: 'AIS-00000009' as RecordId,
    toRecordDisplayName: 'Extraction task',
    toRecordStage: 'execution',
    direction: 'Out',
    createdAt: '2026-07-16T13:00:00Z',
    createdBy: '00000000-0000-0000-0000-000000000001' as UserId,
    ...overrides,
  };
}

/** One S29 members-list row. Defaults to an active Member. */
export function buildMember(overrides: Partial<WorkspaceMemberDto> = {}): WorkspaceMemberDto {
  return {
    userId: '00000000-0000-0000-0000-0000000000a1' as UserId,
    displayName: 'Priya Raman',
    email: 'priya@mws.ai',
    level: 'Member',
    isDisabled: false,
    lastActiveAt: '2026-07-03T13:00:00Z',
    status: 'Active',
    invitationId: null,
    ...overrides,
  };
}

/** One S29 members-list row for a pending invitation (no account yet). */
export function buildInvitation(overrides: Partial<WorkspaceMemberDto> = {}): WorkspaceMemberDto {
  return buildMember({
    userId: null,
    displayName: null,
    email: 'invitee@mws.ai',
    lastActiveAt: null,
    status: 'Invited',
    invitationId: '00000000-0000-0000-0000-0000000000f1',
    ...overrides,
  });
}

/** One S30 Objects-tab row. Defaults to an editable custom object. */
export function buildObjectDefinition(
  overrides: Partial<ObjectDefinitionDto> = {},
): ObjectDefinitionDto {
  return {
    id: '00000000-0000-0000-0000-0000000000d1',
    workspaceId: 'ws-1' as WorkspaceId,
    name: 'Vendor',
    pluralLabel: 'Vendors',
    location: 'LocalWorkspace',
    description: 'A third-party supplier.',
    showInSidebar: true,
    sidebarCategory: 'Reference',
    recordsCount: 0,
    fieldsCount: 0,
    isSystem: false,
    ...overrides,
  };
}

interface ProviderOptions {
  route?: string;
  auth?: AuthContextValue;
  seedMe?: MeDto;
}

export function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (options.seedMe) {
    queryClient.setQueryData(ME_QUERY_KEY, options.seedMe);
  }
  const auth = options.auth ?? buildAuth();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[options.route ?? '/']}>{children}</MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) };
}

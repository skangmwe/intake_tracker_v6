// Shared test helpers (web-testing.md — recurring setup used by 3+ files lives here).
// renderWithProviders wraps a UI in the app's providers (query + auth + router) and lets a
// test seed the /users/me query so shell components render without hitting the network.

import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import type {
  FieldDefinitionDto,
  MeDto,
  PlatformFieldDto,
  UserId,
  WorkspaceId,
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

export function buildFieldDefinition(overrides: Partial<FieldDefinitionDto> = {}): FieldDefinitionDto {
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

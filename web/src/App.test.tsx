import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import type { CustomRecordDto } from '@shared/types';

import { buildFieldDefinition, buildMe, buildMembership, buildObjectDefinition } from '@/test-utils';
import { queryClient } from '@/shared/queryClient';

import { App } from './App';

const meWithWorkspace = buildMe({ memberships: [buildMembership({ level: 'Member' })] });
const vendorObject = buildObjectDefinition({ id: 'obj-vendor', objectKey: 'vendor', name: 'Vendor', pluralLabel: 'Vendors' });
const vendorSchema = { workspaceId: meWithWorkspace.memberships[0]!.workspaceId, objectType: 'vendor', fields: [buildFieldDefinition({ fieldKey: 'tier', displayName: 'Tier', fieldType: 'ShortText', isRequired: false })], platformFields: [] };
const vendorRecord: CustomRecordDto = { id: 'r-1', objectDefinitionId: 'obj-vendor', name: 'Acme', fields: { tier: 'gold' }, createdAt: '2026-07-24T10:00:00Z', updatedAt: '2026-07-24T11:00:00Z', createdBy: 'user-1', eTag: 'v1' };

/** URL-aware API stub so the custom-object routes resolve to a real object/schema/record. */
function mockCustomRecordsApi() {
  globalThis.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/records/')
      ? vendorRecord
      : url.includes('/fields')
        ? vendorSchema
        : url.includes('/objects')
          ? [vendorObject]
          : meWithWorkspace;
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
}

describe('App', () => {
  beforeEach(() => {
    queryClient.clear(); // module-level singleton — clear so cached /me doesn't bleed across tests.
    window.history.pushState({}, '', '/');
    document.documentElement.setAttribute('data-theme', 'light');
    // Dev auth mode (no __APP_CONFIG__); the shell's /users/me call is mocked.
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => buildMe() }) as unknown as typeof fetch;
  });

  it('App — renders the app shell and the home landing page for "/"', async () => {
    // Act
    render(<App />);

    // Assert
    expect(
      await screen.findByRole('complementary', { name: 'Application navigation' }),
    ).toBeInTheDocument();
    // "Home" is both the nav item and the top-bar title for the landing route.
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
  });

  it('App — no axe violations on the landing route', async () => {
    // Arrange
    const { container } = render(<App />);
    await screen.findByRole('complementary', { name: 'Application navigation' });

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });

  it('App — /objects/:objectKey/new mounts the record create page', async () => {
    // Arrange
    window.history.pushState({}, '', '/objects/vendor/new');
    mockCustomRecordsApi();

    // Act
    render(<App />);

    // Assert — the create page resolved the object and rendered its heading (not the 404 fallback).
    expect(await screen.findByRole('heading', { level: 1, name: 'New Vendor' })).toBeInTheDocument();
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
  });

  it('App — /objects/:objectKey/:recordId mounts the record detail page', async () => {
    // Arrange
    window.history.pushState({}, '', '/objects/vendor/r-1');
    mockCustomRecordsApi();

    // Act
    render(<App />);

    // Assert — the detail page resolved the record and rendered its name (not the 404 fallback).
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
  });
});

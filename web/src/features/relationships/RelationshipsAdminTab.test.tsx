// Tests for RelationshipsAdminTab (Slice 25) — the S30 admin surface. Covers: loading /
// error / empty rendered states; system-row lock affordance; create modal opens, validates,
// and submits; retire flow — direct retire when no links, force-confirm dialog when the
// server returns a 409 with a live-link count; restore action for retired rows. jest-axe on
// each meaningfully different rendered state.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RelationshipId, WorkspaceId } from '@shared/types';

import { buildRelationship, renderWithProviders } from '@/test-utils';

import * as api from './api';
import { RelationshipsAdminTab } from './RelationshipsAdminTab';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const WS = 'ws-1' as WorkspaceId;

function renderTab() {
  return renderWithProviders(<RelationshipsAdminTab workspaceId={WS} />);
}

describe('RelationshipsAdminTab', () => {
  beforeEach(() => jest.clearAllMocks());

  it('RelationshipsAdminTab — loading — shows the loading status', () => {
    // Arrange
    mockedApi.fetchRelationships.mockImplementation(
      () => new Promise(() => {
        /* never */
      }),
    );

    // Act
    renderTab();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading relationships/i);
  });

  it('RelationshipsAdminTab — empty — offers to create the first relationship', async () => {
    // Arrange
    mockedApi.fetchRelationships.mockResolvedValue([]);

    // Act
    const { container } = renderTab();

    // Assert
    expect(await screen.findByText(/no relationships defined yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create the first relationship/i }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RelationshipsAdminTab — populated — lists rows, locks system rows, no axe violations', async () => {
    // Arrange — one workspace-authored + one system-seeded row.
    const systemRow = buildRelationship({
      id: 'system-r-1' as RelationshipId,
      name: 'Request has Tasks (system)',
      isSystem: true,
    });
    const userRow = buildRelationship({
      id: 'user-r-1' as RelationshipId,
      name: 'Request has Features',
      toObjectType: 'Feature',
      fromSideLabel: 'Features',
      toSideLabel: 'Request',
      sortOrder: 1,
    });
    mockedApi.fetchRelationships.mockResolvedValue([systemRow, userRow]);

    // Act
    const { container } = renderTab();

    // Assert — system row shows the System badge and locked control; user row shows Retire.
    expect(await screen.findByText('Request has Tasks (system)')).toBeInTheDocument();
    expect(screen.getByLabelText('System relationship')).toBeInTheDocument();
    expect(screen.getByLabelText(/locked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^retire$/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RelationshipsAdminTab — New relationship — opens modal, submits, closes', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRelationships.mockResolvedValue([]);
    mockedApi.createRelationship.mockResolvedValue(
      buildRelationship({ name: 'Feature has Comments', toObjectType: 'Feature' }),
    );

    // Act — open the modal, fill it, submit.
    renderTab();
    await screen.findByText(/no relationships defined yet/i);
    await user.click(screen.getByRole('button', { name: /new relationship/i }));

    const dialog = await screen.findByRole('dialog', { name: 'New relationship' });
    const scoped = within(dialog);
    await user.type(scoped.getByRole('textbox', { name: 'Name' }), 'Feature has Comments');
    await user.type(scoped.getByRole('textbox', { name: 'From-side label' }), 'Comments');
    await user.type(scoped.getByRole('textbox', { name: 'To-side label' }), 'Feature');
    await user.click(scoped.getByRole('button', { name: /create relationship/i }));

    // Assert — the API was called with the trimmed values; the modal closed after success.
    await waitFor(() =>
      expect(mockedApi.createRelationship).toHaveBeenCalledWith(
        WS,
        expect.objectContaining({
          name: 'Feature has Comments',
          fromSideLabel: 'Comments',
          toSideLabel: 'Feature',
          cardinality: 'OneToMany',
          showOnFromAsTab: false,
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('RelationshipsAdminTab — Show as tab — requires a tab label before submit enables', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRelationships.mockResolvedValue([]);
    renderTab();
    await screen.findByText(/no relationships defined yet/i);

    // Act — open modal, fill required fields, toggle Show-as-tab.
    await user.click(screen.getByRole('button', { name: /new relationship/i }));
    const dialog = await screen.findByRole('dialog');
    const scoped = within(dialog);
    await user.type(scoped.getByRole('textbox', { name: 'Name' }), 'Rel');
    await user.type(scoped.getByRole('textbox', { name: 'From-side label' }), 'X');
    await user.type(scoped.getByRole('textbox', { name: 'To-side label' }), 'Y');
    await user.click(scoped.getByRole('checkbox', { name: /show as a tab/i }));

    // Assert — submit disabled until the Tab label is filled.
    const submit = scoped.getByRole('button', { name: /create relationship/i });
    expect(submit).toBeDisabled();

    await user.type(scoped.getByRole('textbox', { name: 'Tab label' }), 'Tab');
    expect(submit).toBeEnabled();
  });

  it('RelationshipsAdminTab — Retire with no live links — retires directly', async () => {
    // Arrange
    const user = userEvent.setup();
    const target = buildRelationship({ id: 'r1' as RelationshipId, name: 'Deletable' });
    mockedApi.fetchRelationships.mockResolvedValue([target]);
    mockedApi.retireRelationship.mockResolvedValue({
      relationshipId: 'r1' as RelationshipId,
      linkCount: 0,
      retired: true,
    });
    renderTab();
    await screen.findByText('Deletable');

    // Act — open the retire dialog, confirm.
    await user.click(screen.getByRole('button', { name: /^retire$/i }));
    const dialog = await screen.findByRole('dialog', { name: /retire this relationship/i });
    await user.click(within(dialog).getByRole('button', { name: /retire relationship/i }));

    // Assert
    await waitFor(() =>
      expect(mockedApi.retireRelationship).toHaveBeenCalledWith('r1', WS, false),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('RelationshipsAdminTab — 409 with links — swaps to force-confirm, second click retires with force', async () => {
    // Arrange — first retireRelationship returns 409 (retired=false, linkCount=3); second returns success.
    const user = userEvent.setup();
    const target = buildRelationship({ id: 'r2' as RelationshipId, name: 'Has links' });
    mockedApi.fetchRelationships.mockResolvedValue([target]);
    mockedApi.retireRelationship
      .mockResolvedValueOnce({
        relationshipId: 'r2' as RelationshipId,
        linkCount: 3,
        retired: false,
      })
      .mockResolvedValueOnce({
        relationshipId: 'r2' as RelationshipId,
        linkCount: 3,
        retired: true,
      });
    renderTab();
    await screen.findByText('Has links');

    // Act — first click sends force=false, dialog swaps copy.
    await user.click(screen.getByRole('button', { name: /^retire$/i }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /retire relationship/i }));

    await waitFor(() =>
      expect(mockedApi.retireRelationship).toHaveBeenLastCalledWith('r2', WS, false),
    );

    // Assert — dialog switches to the force-confirm variant.
    dialog = await screen.findByRole('dialog', { name: /retire with live links/i });
    expect(within(dialog).getByText(/3 linked records/i)).toBeInTheDocument();

    // Act — confirm retire-anyway.
    await user.click(within(dialog).getByRole('button', { name: /retire anyway/i }));

    // Assert — second call carries force=true; dialog closes on success.
    await waitFor(() =>
      expect(mockedApi.retireRelationship).toHaveBeenLastCalledWith('r2', WS, true),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('RelationshipsAdminTab — retired row — shows Restore, calls the API', async () => {
    // Arrange
    const user = userEvent.setup();
    const target = buildRelationship({
      id: 'r3' as RelationshipId,
      name: 'Old rel',
      isRetired: true,
    });
    mockedApi.fetchRelationships.mockResolvedValue([target]);
    mockedApi.restoreRelationship.mockResolvedValue({ ...target, isRetired: false });
    renderTab();
    await screen.findByText('Old rel');

    // Act
    await user.click(screen.getByRole('button', { name: /restore/i }));

    // Assert
    await waitFor(() =>
      expect(mockedApi.restoreRelationship).toHaveBeenCalledWith('r3', WS),
    );
  });
});

// RoleLabelsPage (S37) — the platform-admin gate + list, add, rename, and retire flows. jest-axe runs
// against each meaningfully different rendered state (web-testing.md). Covers AddRoleLabelForm,
// RoleLabelRow (inline rename), and RetireRoleLabelDialog through the page.

import { axe } from 'jest-axe';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeDto, RoleLabelDto } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { createRoleLabel, fetchRoleLabels, renameRoleLabel, retireRoleLabel } from '../api';
import { RoleLabelsPage } from './RoleLabelsPage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedFetch = fetchRoleLabels as jest.MockedFunction<typeof fetchRoleLabels>;
const mockedCreate = createRoleLabel as jest.MockedFunction<typeof createRoleLabel>;
const mockedRename = renameRoleLabel as jest.MockedFunction<typeof renameRoleLabel>;
const mockedRetire = retireRoleLabel as jest.MockedFunction<typeof retireRoleLabel>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const adminMe = () => buildMe({ isPlatformAdmin: true });
const label = (over: Partial<RoleLabelDto> = {}): RoleLabelDto => ({
  roleLabelId: '11111111-0000-4000-8000-000000000001',
  label: 'InfoSec',
  sortOrder: 0,
  ...over,
});

function renderPage(me: MeDto) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<RoleLabelsPage />, { seedMe: me });
}

beforeEach(() => jest.clearAllMocks());

describe('RoleLabelsPage', () => {
  it('renders the role-label list for a platform admin', async () => {
    mockedFetch.mockResolvedValue([label()]);
    const { container } = renderPage(adminMe());
    expect(await screen.findByText('InfoSec')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the empty state when the catalog is empty', async () => {
    mockedFetch.mockResolvedValue([]);
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/no role labels yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the error state when the catalog fails', async () => {
    mockedFetch.mockRejectedValue(new Error('boom'));
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/catalog could not be loaded/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('adds a role label', async () => {
    mockedFetch.mockResolvedValue([]);
    mockedCreate.mockResolvedValue(label({ label: 'Records Manager' }));
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByText(/no role labels yet/i);

    const addForm = screen.getByRole('form', { name: 'Add a role label' });
    await user.type(within(addForm).getByRole('textbox'), 'Records Manager');
    await user.click(within(addForm).getByRole('button', { name: /add role label/i }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith({ label: 'Records Manager' }));
  });

  it('renames a role label inline', async () => {
    mockedFetch.mockResolvedValue([label()]);
    mockedRename.mockResolvedValue(label({ label: 'InfoSec Team' }));
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByText('InfoSec');

    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const editForm = screen.getByRole('form', { name: 'Rename InfoSec' });
    const input = within(editForm).getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'InfoSec Team');
    await user.click(within(editForm).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedRename).toHaveBeenCalledWith(label().roleLabelId, { label: 'InfoSec Team' }),
    );
  });

  it('opens the retire dialog and retires the label', async () => {
    mockedFetch.mockResolvedValue([label()]);
    mockedRetire.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByText('InfoSec');

    await user.click(screen.getByRole('button', { name: 'Retire' }));
    const dialog = await screen.findByRole('dialog');
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Retire InfoSec' }));

    await waitFor(() => expect(mockedRetire).toHaveBeenCalledWith(label().roleLabelId));
  });
});

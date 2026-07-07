// CrossingMapPage (S35) — the platform-admin gate, read, propose form, and confirm action. jest-axe runs
// against each meaningfully different rendered state (web-testing.md). The platform-admin api and
// /users/me are mocked at the boundary so the surface renders without network.

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CrossingCandidatesDto, CrossingMapRowDto, MeDto } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { confirmCrossingMap, fetchCrossingCandidates, fetchCrossingMap, proposeCrossingMap } from '../api';
import { CrossingMapPage } from './CrossingMapPage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedCrossingMap = fetchCrossingMap as jest.MockedFunction<typeof fetchCrossingMap>;
const mockedCandidates = fetchCrossingCandidates as jest.MockedFunction<typeof fetchCrossingCandidates>;
const mockedPropose = proposeCrossingMap as jest.MockedFunction<typeof proposeCrossingMap>;
const mockedConfirm = confirmCrossingMap as jest.MockedFunction<typeof confirmCrossingMap>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const adminMe = () => buildMe({ isPlatformAdmin: true });
const nonAdminMe = () => buildMe({ isPlatformAdmin: false });

const SEEDED_ROW: CrossingMapRowDto = {
  crossingMapId: null,
  sourceFieldKey: 'business-value',
  sourceDisplayName: 'Business Value',
  sourceFieldType: 'Number',
  targetFieldKey: 'business-value',
  targetDisplayName: 'Business Value',
  targetFieldType: 'Number',
  status: 'Seeded',
  optionCorrespondenceJson: null,
  confirmedByUserId: null,
  confirmedAt: null,
};

const NO_CANDIDATES: CrossingCandidatesDto = { pgFields: [], aiFields: [] };

function renderPage(me: MeDto) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<CrossingMapPage />, { seedMe: me });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCandidates.mockResolvedValue(NO_CANDIDATES);
});

describe('CrossingMapPage', () => {
  it('renders the crossing map for a platform admin', async () => {
    mockedCrossingMap.mockResolvedValue([SEEDED_ROW]);
    const { container } = renderPage(adminMe());
    expect(await screen.findByRole('table', { name: /crossing map/i })).toBeInTheDocument();
    expect(screen.getAllByText('business-value').length).toBeGreaterThan(0);
    expect(screen.getByText('Seeded')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders an em-dash when a mapped field has no display name', async () => {
    mockedCrossingMap.mockResolvedValue([
      { ...SEEDED_ROW, sourceDisplayName: '', targetDisplayName: '', sourceFieldType: '', targetFieldType: '' },
    ]);
    const { container } = renderPage(adminMe());
    await screen.findByRole('table', { name: /crossing map/i });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('proposes a mapping from the candidate pickers', async () => {
    mockedCrossingMap.mockResolvedValue([]);
    mockedCandidates.mockResolvedValue({
      pgFields: [{ fieldDefinitionId: 'pg-1', side: 'PG', fieldKey: 'pgClient', displayName: 'Client', fieldType: 'ShortText' }],
      aiFields: [{ fieldDefinitionId: 'ai-1', side: 'AI', fieldKey: 'aiClient', displayName: 'Client', fieldType: 'ShortText' }],
    });
    mockedPropose.mockResolvedValue({ ...SEEDED_ROW, crossingMapId: 'cm-1', status: 'Proposed' });
    const user = userEvent.setup();
    renderPage(adminMe());

    // The pickers are disabled until the candidate read resolves.
    await waitFor(() => expect(screen.getByLabelText(/PG \/ Dept field/i)).toBeEnabled());
    await user.selectOptions(screen.getByLabelText(/PG \/ Dept field/i), 'pg-1');
    await user.selectOptions(screen.getByLabelText(/AI Solutions field/i), 'ai-1');
    await user.click(screen.getByRole('button', { name: /propose mapping/i }));

    await waitFor(() =>
      expect(mockedPropose).toHaveBeenCalledWith({ pgFieldDefinitionId: 'pg-1', aiFieldDefinitionId: 'ai-1' }),
    );
  });

  it('confirms a proposed mapping', async () => {
    mockedCrossingMap.mockResolvedValue([
      { ...SEEDED_ROW, crossingMapId: 'cm-9', status: 'Proposed' },
    ]);
    mockedConfirm.mockResolvedValue({ ...SEEDED_ROW, crossingMapId: 'cm-9', status: 'Confirmed' });
    const user = userEvent.setup();
    renderPage(adminMe());

    await screen.findByRole('table', { name: /crossing map/i });
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('cm-9'));
  });

  it('shows the empty state when no fields are mapped', async () => {
    mockedCrossingMap.mockResolvedValue([]);
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/no crossing fields are mapped/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the error state when the map fails', async () => {
    mockedCrossingMap.mockRejectedValue(new Error('boom'));
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/crossing map could not be loaded/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows a warning and does not fetch for a non-admin', async () => {
    const { container } = renderPage(nonAdminMe());
    expect(await screen.findByRole('alert')).toHaveTextContent(/available to platform admins/i);
    expect(mockedCrossingMap).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});

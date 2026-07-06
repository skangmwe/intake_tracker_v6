// CrossingMapPage (S35) — the platform-admin gate + read. jest-axe runs against each meaningfully
// different rendered state (web-testing.md). The platform-admin api and /users/me are mocked at the
// boundary so the surface renders without network.

import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';

import type { CrossingMapRowDto, MeDto } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { fetchCrossingMap } from '../api';
import { CrossingMapPage } from './CrossingMapPage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedCrossingMap = fetchCrossingMap as jest.MockedFunction<typeof fetchCrossingMap>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const adminMe = () => buildMe({ isPlatformAdmin: true });
const nonAdminMe = () => buildMe({ isPlatformAdmin: false });

const ROW: CrossingMapRowDto = {
  sourceFieldKey: 'business-value',
  sourceDisplayName: 'Business Value',
  sourceFieldType: 'Number',
  targetFieldKey: 'business-value',
  targetDisplayName: 'Business Value',
  targetFieldType: 'Number',
};

function renderPage(me: MeDto) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<CrossingMapPage />, { seedMe: me });
}

beforeEach(() => jest.clearAllMocks());

describe('CrossingMapPage', () => {
  it('renders the crossing map for a platform admin', async () => {
    mockedCrossingMap.mockResolvedValue([ROW]);
    const { container } = renderPage(adminMe());
    expect(await screen.findByRole('table', { name: /crossing map/i })).toBeInTheDocument();
    expect(screen.getAllByText('business-value').length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders an em-dash when a mapped field has no display name', async () => {
    mockedCrossingMap.mockResolvedValue([
      { ...ROW, sourceDisplayName: '', targetDisplayName: '', sourceFieldType: '', targetFieldType: '' },
    ]);
    const { container } = renderPage(adminMe());
    await screen.findByRole('table', { name: /crossing map/i });
    // The field keys still render; the blank display names/types fall back to em-dash.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the empty state when no fields are mapped', async () => {
    mockedCrossingMap.mockResolvedValue([]);
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/no crossing fields are mapped/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the loading state while the map is in flight', async () => {
    mockedCrossingMap.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/loading the crossing map/i)).toBeInTheDocument();
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

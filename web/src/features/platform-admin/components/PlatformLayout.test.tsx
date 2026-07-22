// PlatformLayout — the settings-style frame for the platform area. Covers the three gate states
// (loading, load-error, not-a-platform-admin) and the admin success state (surface list + the
// active surface rendered via Outlet, with the correct link marked current). jest-axe runs on each
// meaningfully different state (web-testing.md).

import { axe } from 'jest-axe';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import type { MeDto } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { PlatformLayout } from './PlatformLayout';

jest.mock('@/features/users/api');
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const adminMe = () => buildMe({ isPlatformAdmin: true });

function renderLayout(options: { seedMe?: MeDto; route?: string } = {}) {
  const providerOptions: Parameters<typeof renderWithProviders>[1] = {
    route: options.route ?? '/platform/fields',
  };
  if (options.seedMe) {
    providerOptions.seedMe = options.seedMe;
  }
  return renderWithProviders(
    <Routes>
      <Route path="/platform" element={<PlatformLayout />}>
        <Route path="fields" element={<div>Field schema surface</div>} />
        <Route path="crossing-map" element={<div>Crossing map surface</div>} />
      </Route>
    </Routes>,
    providerOptions,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('PlatformLayout', () => {
  it('PlatformLayout — loading — shows a loading status', async () => {
    // Arrange — /users/me never resolves
    mockedFetchMe.mockReturnValue(new Promise<MeDto>(() => {}));

    // Act
    const { container } = renderLayout();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformLayout — load error — shows an error alert', async () => {
    // Arrange
    mockedFetchMe.mockRejectedValue(new Error('boom'));

    // Act
    const { container } = renderLayout();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformLayout — non-platform-admin — gates the area and hides the surface list', async () => {
    // Arrange
    const me = buildMe({ isPlatformAdmin: false });
    mockedFetchMe.mockResolvedValue(me);

    // Act
    const { container } = renderLayout({ seedMe: me });

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/available to platform admins/i);
    expect(screen.queryByRole('navigation', { name: 'Platform' })).not.toBeInTheDocument();
    expect(screen.queryByText('Field schema surface')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformLayout — platform admin — renders the surface list and the active surface', async () => {
    // Arrange
    const me = adminMe();
    mockedFetchMe.mockResolvedValue(me);

    // Act
    const { container } = renderLayout({ seedMe: me });

    // Assert — the side list (six links) plus the active surface in the content column
    const nav = screen.getByRole('navigation', { name: 'Platform settings' });
    expect(within(nav).getAllByRole('link')).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'Field schema' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // The shared header shows the surface's header title, which differs from its short nav label
    // ("Field schema" nav → "Fields & objects" header).
    expect(screen.getByRole('heading', { name: 'Fields & objects' })).toBeInTheDocument();
    expect(screen.getByText('Field schema surface')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformLayout — a different surface — marks that link current', () => {
    // Arrange
    const me = adminMe();
    mockedFetchMe.mockResolvedValue(me);

    // Act
    renderLayout({ seedMe: me, route: '/platform/crossing-map' });

    // Assert
    expect(screen.getByRole('link', { name: 'Crossing map' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Field schema' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Crossing map surface')).toBeInTheDocument();
  });
});

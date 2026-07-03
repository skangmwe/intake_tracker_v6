import { useContext } from 'react';
import { render, screen } from '@testing-library/react';

import { setAuthTokenProvider } from '@/shared/http/apiClient';

import { AuthProvider } from './AuthProvider';
import { AuthContext } from './authContext';

jest.mock('@/shared/http/apiClient', () => ({
  setAuthTokenProvider: jest.fn(),
}));

function Identity() {
  const auth = useContext(AuthContext);
  if (!auth?.isAuthenticated || !auth.user) return <div>anon</div>;
  return <div data-testid="who">{auth.user.name}</div>;
}

describe('AuthProvider — dev mode', () => {
  beforeEach(() => jest.clearAllMocks());

  // No __APP_CONFIG__ is injected in the test env, so appConfig.authMode === 'dev'.
  it('AuthProvider — dev mode — signs in the local developer and renders children', () => {
    // Act
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );

    // Assert — the caller is treated as authenticated without MSAL.
    expect(screen.getByTestId('who')).toHaveTextContent('Local Developer');
  });

  it('AuthProvider — dev mode — installs a null token provider (dev-bypass sends no bearer)', () => {
    // Act
    render(
      <AuthProvider>
        <Identity />
      </AuthProvider>,
    );

    // Assert
    expect(setAuthTokenProvider).toHaveBeenCalledTimes(1);
  });
});

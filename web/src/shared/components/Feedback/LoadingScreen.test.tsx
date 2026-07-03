import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { LoadingScreen } from './LoadingScreen';

describe('LoadingScreen', () => {
  it('LoadingScreen — renders the label in a live status region', () => {
    render(<LoadingScreen label="Signing you in…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Signing you in…');
  });

  it('LoadingScreen — no axe violations', async () => {
    const { container } = render(<LoadingScreen label="Starting up…" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

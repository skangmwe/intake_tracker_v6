import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { PlaceholderPage } from './PlaceholderPage';

describe('PlaceholderPage', () => {
  it('PlaceholderPage — renders the title as the heading', () => {
    render(<PlaceholderPage title="Requests" />);
    expect(screen.getByRole('heading', { name: 'Requests' })).toBeInTheDocument();
  });

  it('PlaceholderPage — no axe violations', async () => {
    const { container } = render(<PlaceholderPage title="Dashboards" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Lockup } from './Lockup';

describe('Lockup', () => {
  it('Lockup — default — renders the symbol and the name', () => {
    render(<Lockup name="AI Solutions Tracker" />);
    expect(screen.getByRole('img', { name: 'McDermott' })).toBeInTheDocument();
    expect(screen.getByText('AI Solutions Tracker')).toBeInTheDocument();
  });

  it('Lockup — symbolOnly — hides the name (collapsed rail)', () => {
    render(<Lockup name="AI Solutions Tracker" symbolOnly />);
    expect(screen.getByRole('img', { name: 'McDermott' })).toBeInTheDocument();
    expect(screen.queryByText('AI Solutions Tracker')).not.toBeInTheDocument();
  });

  it('Lockup — no axe violations (full and symbol-only)', async () => {
    const full = render(<Lockup name="AI Solutions Tracker" />);
    expect(await axe(full.container)).toHaveNoViolations();

    const symbol = render(<Lockup name="AI Solutions Tracker" symbolOnly />);
    expect(await axe(symbol.container)).toHaveNoViolations();
  });
});

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { StatusHoldPill } from './StatusHoldPill';

describe('StatusHoldPill', () => {
  it('StatusHoldPill — omits chrome for InProgress by default (implicit state has no pill)', () => {
    const { container } = render(<StatusHoldPill statusHold="InProgress" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('StatusHoldPill — alwaysRender forces the InProgress pill for callers preserving layout', () => {
    render(<StatusHoldPill statusHold="InProgress" alwaysRender />);
    const pill = screen.getByText('In progress');
    expect(pill).toHaveAttribute('data-ds', 'status-pill');
    expect(pill).toHaveAttribute('data-status-hold', 'InProgress');
    expect(pill).toHaveClass('mws-badge', 'mws-badge--live');
  });

  it('StatusHoldPill — OnHold shows the pending pill with the warning tone', () => {
    render(<StatusHoldPill statusHold="OnHold" />);
    const pill = screen.getByText('On hold');
    expect(pill).toHaveClass('mws-badge--pending');
    expect(pill).toHaveAttribute('data-status-hold', 'OnHold');
  });

  it('StatusHoldPill — null or undefined renders nothing (safe default when data missing)', () => {
    const { container, rerender } = render(<StatusHoldPill statusHold={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<StatusHoldPill statusHold={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('StatusHoldPill — no axe violations across states', async () => {
    const { container } = render(
      <>
        <StatusHoldPill statusHold="InProgress" alwaysRender />
        <StatusHoldPill statusHold="OnHold" />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

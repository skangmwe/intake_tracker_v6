import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('StatusPill — renders the label text alongside the status colour', () => {
    render(<StatusPill status="success" label="On track" />);
    const pill = screen.getByText('On track');
    expect(pill).toHaveAttribute('data-ds', 'status-pill');
    expect(pill).toHaveClass('mws-badge', 'mws-badge--live');
  });

  it.each([
    ['info', 'mws-badge--info'],
    ['success', 'mws-badge--live'],
    ['warning', 'mws-badge--pending'],
    ['error', 'mws-badge--failed'],
    ['neutral', 'mws-badge--draft'],
  ] as const)('StatusPill — %s maps to the %s variant', (status, variantClass) => {
    render(<StatusPill status={status} label={status} />);
    expect(screen.getByText(status)).toHaveClass(variantClass);
  });

  it('StatusPill — no axe violations across severities', async () => {
    const { container } = render(
      <>
        <StatusPill status="info" label="Info" />
        <StatusPill status="success" label="Success" />
        <StatusPill status="warning" label="Warning" />
        <StatusPill status="error" label="Error" />
        <StatusPill status="neutral" label="Neutral" />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

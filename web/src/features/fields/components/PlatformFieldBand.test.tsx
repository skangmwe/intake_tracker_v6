import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'jest-axe';

import { buildPlatformField } from '@/test-utils';

import { PlatformFieldBand } from './PlatformFieldBand';

function renderBand(canManage: boolean) {
  return render(
    <MemoryRouter>
      <PlatformFieldBand
        platformFields={[
          buildPlatformField(),
          buildPlatformField({ id: 'p2' as never, fieldKey: 'record-id', displayName: 'Record ID', isSystemImmutable: true }),
          buildPlatformField({ id: 'p3' as never, fieldKey: 'ai-solutions-status', displayName: 'AI Solutions Status', hasManualWritePath: false }),
        ]}
        canManage={canManage}
      />
    </MemoryRouter>,
  );
}

describe('PlatformFieldBand', () => {
  it('PlatformFieldBand — renders each platform field with its provenance badges', () => {
    renderBand(false);
    expect(screen.getByText('Record ID')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('No manual writes')).toBeInTheDocument();
  });

  it('PlatformFieldBand — platform admin — links out to the platform schema', () => {
    renderBand(true);
    expect(screen.getByRole('link', { name: /manage in platform schema/i })).toHaveAttribute('href', '/platform/fields');
  });

  it('PlatformFieldBand — not a platform admin — hides the manage link', () => {
    renderBand(false);
    expect(screen.queryByRole('link', { name: /manage in platform schema/i })).not.toBeInTheDocument();
  });

  it('PlatformFieldBand — empty — renders nothing', () => {
    const { container } = render(
      <MemoryRouter>
        <PlatformFieldBand platformFields={[]} canManage />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('PlatformFieldBand — no axe violations', async () => {
    const { container } = renderBand(true);
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildFieldCatalogRow } from '@/test-utils';

import { FieldReadOnlySheet } from './FieldReadOnlySheet';

describe('FieldReadOnlySheet', () => {
  it('FieldReadOnlySheet — system row — shows the system lock message and attributes', () => {
    render(
      <FieldReadOnlySheet
        row={buildFieldCatalogRow({
          displayName: 'Record ID',
          source: 'System',
          location: 'Global',
          isReadOnly: true,
        })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Record ID' })).toBeInTheDocument();
    expect(screen.getByText(/system field, provisioned automatically/i)).toBeInTheDocument();
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  it('FieldReadOnlySheet — foreign global row — shows the other-workspace lock message', () => {
    render(
      <FieldReadOnlySheet
        row={buildFieldCatalogRow({ source: 'User', location: 'Global', isReadOnly: true })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText(/owned by another workspace/i)).toBeInTheDocument();
  });

  it('FieldReadOnlySheet — Escape closes', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<FieldReadOnlySheet row={buildFieldCatalogRow()} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('FieldReadOnlySheet — no axe violations', async () => {
    const { container } = render(
      <FieldReadOnlySheet
        row={buildFieldCatalogRow({ source: 'System', isReadOnly: true })}
        onClose={jest.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

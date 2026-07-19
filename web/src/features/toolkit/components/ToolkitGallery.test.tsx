// Unit tests for the Toolkit gallery — renders a card per item, opens on click, and passes axe.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ToolkitItemId, ToolkitItemListRow, UserId } from '@shared/types';

import { ToolkitGallery } from './ToolkitGallery';

function row(overrides: Partial<ToolkitItemListRow> = {}): ToolkitItemListRow {
  return {
    id: 'AIS-00000073' as ToolkitItemId,
    kind: 'Prompt',
    status: 'Active',
    name: 'Clause extraction prompt',
    oneLiner: 'Pulls structured clauses out of contracts',
    maintainer: 'Mia Chen',
    hasAttachment: false,
    lastModifiedAt: '2026-07-02T10:00:00Z',
    lastModifiedBy: 'Mia Chen' as UserId,
    eTag: 'etag==',
    ...overrides,
  };
}

describe('ToolkitGallery', () => {
  it('ToolkitGallery — items provided — renders a card per item with its name', () => {
    // Arrange + Act
    render(<ToolkitGallery items={[row(), row({ id: 'AIS-00000074' as ToolkitItemId, name: 'Redline plugin' })]} onOpen={jest.fn()} />);

    // Assert
    expect(screen.getByText('Clause extraction prompt')).toBeInTheDocument();
    expect(screen.getByText('Redline plugin')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('ToolkitGallery — card click — opens the item', async () => {
    // Arrange
    const onOpen = jest.fn();
    render(<ToolkitGallery items={[row()]} onOpen={onOpen} />);

    // Act
    await userEvent.click(screen.getByText('Clause extraction prompt'));

    // Assert
    expect(onOpen).toHaveBeenCalledWith('AIS-00000073');
  });

  it('ToolkitGallery — no axe violations', async () => {
    // Arrange
    const { container } = render(<ToolkitGallery items={[row()]} onOpen={jest.fn()} />);

    // Act + Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

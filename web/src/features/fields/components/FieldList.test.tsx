import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildFieldDefinition } from '@/test-utils';

import { FieldList } from './FieldList';

describe('FieldList', () => {
  it('FieldList — renders a row per field with its key and type', () => {
    render(<FieldList fields={[buildFieldDefinition()]} onEdit={jest.fn()} onRetire={jest.fn()} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('Short text')).toBeInTheDocument();
  });

  it('FieldList — edit — invokes onEdit with the field', async () => {
    // Arrange
    const field = buildFieldDefinition();
    const onEdit = jest.fn();
    const user = userEvent.setup();
    render(<FieldList fields={[field]} onEdit={onEdit} onRetire={jest.fn()} />);

    // Act
    await user.click(screen.getByRole('button', { name: /edit/i }));

    // Assert
    expect(onEdit).toHaveBeenCalledWith(field);
  });

  it('FieldList — retired field — shows the retired badge and hides the retire action', () => {
    render(<FieldList fields={[buildFieldDefinition({ isRetired: true })]} onEdit={jest.fn()} onRetire={jest.fn()} />);
    expect(screen.getByText('Retired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retire$/i })).not.toBeInTheDocument();
  });

  it('FieldList — no axe violations', async () => {
    const { container } = render(
      <FieldList
        fields={[buildFieldDefinition(), buildFieldDefinition({ id: 'f2' as never, fieldKey: 'dueDate', displayName: 'Due Date', isRetired: true })]}
        onEdit={jest.fn()}
        onRetire={jest.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

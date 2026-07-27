import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildObjectDefinition } from '@/test-utils';

import { GlobalObjectFieldPicker } from './GlobalObjectFieldPicker';

const VENDOR = buildObjectDefinition({ objectKey: 'vendor', name: 'Vendor', isSystem: false });

describe('GlobalObjectFieldPicker', () => {
  it('GlobalObjectFieldPicker — no Global custom objects — renders nothing', () => {
    // Arrange / Act
    const { container } = render(<GlobalObjectFieldPicker objects={[]} onCreateField={jest.fn()} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('GlobalObjectFieldPicker — New field is disabled until an object is picked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<GlobalObjectFieldPicker objects={[VENDOR]} onCreateField={jest.fn()} />);

    // Assert — disabled with nothing picked
    expect(screen.getByRole('button', { name: /new field/i })).toBeDisabled();

    // Act — pick the object
    await user.selectOptions(screen.getByLabelText(/global object for new field/i), 'vendor');

    // Assert
    expect(screen.getByRole('button', { name: /new field/i })).toBeEnabled();
  });

  it('GlobalObjectFieldPicker — New field — calls onCreateField with the selected object', async () => {
    // Arrange
    const onCreateField = jest.fn();
    const user = userEvent.setup();
    render(<GlobalObjectFieldPicker objects={[VENDOR]} onCreateField={onCreateField} />);

    // Act
    await user.selectOptions(screen.getByLabelText(/global object for new field/i), 'vendor');
    await user.click(screen.getByRole('button', { name: /new field/i }));

    // Assert
    expect(onCreateField).toHaveBeenCalledWith(VENDOR);
  });

  it('GlobalObjectFieldPicker — no axe violations', async () => {
    // Arrange
    const { container } = render(
      <GlobalObjectFieldPicker objects={[VENDOR]} onCreateField={jest.fn()} />,
    );

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });
});

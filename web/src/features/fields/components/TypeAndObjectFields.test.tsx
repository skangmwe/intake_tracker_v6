import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FIELD_TYPE_OPTIONS } from '../constants';
import { buildInitialForm } from '../fieldForm';
import { TypeAndObjectFields } from './TypeAndObjectFields';

function renderFields(
  overrides: Partial<React.ComponentProps<typeof TypeAndObjectFields>> = {},
) {
  const props: React.ComponentProps<typeof TypeAndObjectFields> = {
    form: buildInitialForm(null, 'Request', FIELD_TYPE_OPTIONS),
    fieldTypeOptions: FIELD_TYPE_OPTIONS,
    isCreate: true,
    readOnly: false,
    customObjectOptions: [],
    onPatch: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<TypeAndObjectFields {...props} />) };
}

describe('TypeAndObjectFields', () => {
  it('TypeAndObjectFields — default — renders the Type and Object selects', () => {
    // Arrange / Act
    renderFields();

    // Assert
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Object')).toBeInTheDocument();
  });

  it('TypeAndObjectFields — edit mode — the Object select is locked', () => {
    // Arrange / Act
    renderFields({ isCreate: false });

    // Assert — object is part of a field's identity and cannot change on edit.
    expect(screen.getByLabelText('Object')).toBeDisabled();
  });

  it('TypeAndObjectFields — fixedObject — Object is a static label, no select', () => {
    // Arrange / Act
    renderFields({ fixedObject: { objectType: 'vendor', label: 'Vendor' } });

    // Assert
    expect(screen.queryByLabelText('Object')).not.toBeInTheDocument();
    expect(screen.getByText('Object')).toBeInTheDocument();
    expect(screen.getByText('Vendor')).toBeInTheDocument();
  });

  it('TypeAndObjectFields — switching to a custom object — forces LocalWorkspace', async () => {
    // Arrange
    const user = userEvent.setup();
    const { props } = renderFields({
      customObjectOptions: [{ value: 'vendorReview', label: 'Vendor Review' }],
    });

    // Act
    await user.selectOptions(screen.getByLabelText('Object'), 'vendorReview');

    // Assert
    expect(props.onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ object: 'vendorReview', location: 'LocalWorkspace' }),
    );
  });

  it('TypeAndObjectFields — no axe violations (default and fixedObject)', async () => {
    // Arrange
    const { container, rerender } = renderFields();

    // Act / Assert
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <TypeAndObjectFields
        form={buildInitialForm(null, 'vendor', FIELD_TYPE_OPTIONS)}
        fieldTypeOptions={FIELD_TYPE_OPTIONS}
        isCreate
        readOnly={false}
        customObjectOptions={[]}
        fixedObject={{ objectType: 'vendor', label: 'Vendor' }}
        onPatch={jest.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { buildInitialForm } from '../fieldForm';
import { FIELD_TYPE_OPTIONS } from '../constants';
import { FieldObjectAndLocationFields } from './FieldObjectAndLocationFields';

function renderFields(
  overrides: Partial<React.ComponentProps<typeof FieldObjectAndLocationFields>> = {},
) {
  const props: React.ComponentProps<typeof FieldObjectAndLocationFields> = {
    form: buildInitialForm(null, 'Request', FIELD_TYPE_OPTIONS),
    isCreate: true,
    readOnly: false,
    customObjectOptions: [],
    onPatch: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<FieldObjectAndLocationFields {...props} />) };
}

describe('FieldObjectAndLocationFields', () => {
  it('FieldObjectAndLocationFields — default — renders both Object and Location selects', () => {
    // Arrange / Act
    renderFields();

    // Assert
    expect(screen.getByLabelText('Object')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
  });

  it('FieldObjectAndLocationFields — fixedObject — Object is a static label, no Location control', () => {
    // Arrange / Act
    renderFields({ fixedObject: { objectType: 'vendor', label: 'Vendor' } });

    // Assert
    expect(screen.queryByLabelText('Object')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();
    expect(screen.getByText('Object')).toBeInTheDocument();
    expect(screen.getByText('Vendor')).toBeInTheDocument();
  });

  it('FieldObjectAndLocationFields — no axe violations (default and fixedObject)', async () => {
    // Arrange
    const { container, rerender } = renderFields();

    // Act / Assert
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <FieldObjectAndLocationFields
        form={buildInitialForm(null, 'vendor', FIELD_TYPE_OPTIONS)}
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

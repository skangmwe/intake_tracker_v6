import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FIELD_TYPE_OPTIONS } from '../constants';
import { buildInitialForm } from '../fieldForm';
import { LocationAndSectionFields } from './LocationAndSectionFields';

function renderFields(
  overrides: Partial<React.ComponentProps<typeof LocationAndSectionFields>> = {},
) {
  const props: React.ComponentProps<typeof LocationAndSectionFields> = {
    form: buildInitialForm(null, 'Request', FIELD_TYPE_OPTIONS),
    readOnly: false,
    customObjectOptions: [],
    onPatch: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<LocationAndSectionFields {...props} />) };
}

describe('LocationAndSectionFields', () => {
  it('LocationAndSectionFields — default — renders the Location select and Section input', () => {
    // Arrange / Act
    renderFields();

    // Assert
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
    expect(screen.getByLabelText(/section/i)).toBeInTheDocument();
  });

  it('LocationAndSectionFields — custom-object form — disables the Location select', () => {
    // Arrange / Act — a form already scoped to a custom object.
    renderFields({
      form: {
        ...buildInitialForm(null, 'vendorReview', FIELD_TYPE_OPTIONS),
        location: 'LocalWorkspace',
      },
      customObjectOptions: [{ value: 'vendorReview', label: 'Vendor Review' }],
    });

    // Assert
    expect(screen.getByLabelText('Location')).toBeDisabled();
  });

  it('LocationAndSectionFields — fixedObject — drops Location, keeps Section', () => {
    // Arrange / Act
    renderFields({ fixedObject: { objectType: 'vendor', label: 'Vendor' } });

    // Assert
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/section/i)).toBeInTheDocument();
  });

  it('LocationAndSectionFields — typing a section — patches the form', async () => {
    // Arrange
    const user = userEvent.setup();
    const { props } = renderFields();

    // Act
    await user.type(screen.getByLabelText(/section/i), 'A');

    // Assert
    expect(props.onPatch).toHaveBeenCalledWith({ section: 'A' });
  });

  it('LocationAndSectionFields — no axe violations (default and fixedObject)', async () => {
    // Arrange
    const { container, rerender } = renderFields();

    // Act / Assert
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <LocationAndSectionFields
        form={buildInitialForm(null, 'vendor', FIELD_TYPE_OPTIONS)}
        readOnly={false}
        customObjectOptions={[]}
        fixedObject={{ objectType: 'vendor', label: 'Vendor' }}
        onPatch={jest.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

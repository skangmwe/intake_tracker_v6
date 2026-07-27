// FieldEditorExtras — the type-conditional sections of the field editor (numeric bounds, select
// options, derived config) plus the always-present "Visible on stages" fieldset. Purely
// presentational; these tests cover each conditional branch, the stage toggle, the disabled state,
// and axe on the meaningfully different renders.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FIELD_TYPE_OPTIONS } from '../constants';
import { buildInitialForm, type FieldForm } from '../fieldForm';
import { FieldEditorExtras } from './FieldEditorExtras';

function formOfType(fieldType: FieldForm['fieldType']): FieldForm {
  return { ...buildInitialForm(null, 'Request', FIELD_TYPE_OPTIONS), fieldType };
}

function renderExtras(overrides: Partial<React.ComponentProps<typeof FieldEditorExtras>> = {}) {
  const props: React.ComponentProps<typeof FieldEditorExtras> = {
    form: formOfType('ShortText'),
    onPatch: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<FieldEditorExtras {...props} />) };
}

describe('FieldEditorExtras', () => {
  it('FieldEditorExtras — default — renders the Visible-on-stages fieldset with stage checkboxes', async () => {
    // Arrange / Act
    const { container } = renderExtras();

    // Assert
    expect(screen.getByText('Visible on stages')).toBeInTheDocument();
    expect(screen.getByLabelText('intake')).toBeInTheDocument();
    expect(screen.getByLabelText('closure')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldEditorExtras — toggling a stage — patches visibleStages', async () => {
    // Arrange
    const user = userEvent.setup();
    const { props } = renderExtras();

    // Act
    await user.click(screen.getByLabelText('execution'));

    // Assert
    expect(props.onPatch).toHaveBeenCalledWith({ visibleStages: ['execution'] });
  });

  it('FieldEditorExtras — numeric type — reveals Min and Max value inputs', async () => {
    // Arrange / Act
    const { container } = renderExtras({ form: formOfType('Number') });

    // Assert
    expect(screen.getByLabelText('Min value')).toBeInTheDocument();
    expect(screen.getByLabelText('Max value')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldEditorExtras — select type — reveals the options editor', () => {
    // Arrange / Act
    renderExtras({ form: formOfType('SingleSelect') });

    // Assert
    expect(screen.getByRole('button', { name: /add option/i })).toBeInTheDocument();
  });

  it('FieldEditorExtras — calculation type — reveals the expression input', () => {
    // Arrange / Act
    renderExtras({ form: formOfType('Calculation') });

    // Assert
    expect(screen.getByLabelText('Expression')).toBeInTheDocument();
  });

  it('FieldEditorExtras — derived-category type — reveals the default-value input', () => {
    // Arrange / Act
    renderExtras({ form: formOfType('DerivedCategory') });

    // Assert
    expect(screen.getByLabelText(/default value/i)).toBeInTheDocument();
  });

  it('FieldEditorExtras — disabled — stage checkboxes are disabled', async () => {
    // Arrange / Act
    const { container } = renderExtras({ disabled: true });

    // Assert
    expect(screen.getByLabelText('intake')).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });
});

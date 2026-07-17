// Tests for SystemProvisionedFieldBand (Slice 25). Covers: renders each row with its
// type + System badges, hides itself when empty (so the section header doesn't leak on
// object types without system-provisioned rows), and passes jest-axe.

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { buildFieldDefinition } from '@/test-utils';

import { SystemProvisionedFieldBand } from './SystemProvisionedFieldBand';

expect.extend(toHaveNoViolations);

describe('SystemProvisionedFieldBand', () => {
  it('SystemProvisionedFieldBand — renders each row with type + System badges', () => {
    // Arrange — the seeded row for the per-workspace `name` field (migration 057).
    const nameField = buildFieldDefinition({
      fieldKey: 'name',
      displayName: 'Name',
      fieldType: 'ShortText',
      isSystemProvisioned: true,
    });

    // Act
    render(<SystemProvisionedFieldBand fields={[nameField]} />);

    // Assert
    expect(screen.getByRole('heading', { name: 'System-provisioned fields' })).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText(/short text/i)).toBeInTheDocument();
  });

  it('SystemProvisionedFieldBand — empty — renders nothing', () => {
    // Arrange + Act
    const { container } = render(<SystemProvisionedFieldBand fields={[]} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('SystemProvisionedFieldBand — no axe violations', async () => {
    // Arrange
    const fields = [
      buildFieldDefinition({ fieldKey: 'name', displayName: 'Name', isSystemProvisioned: true }),
    ];

    // Act
    const { container } = render(<SystemProvisionedFieldBand fields={fields} />);

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

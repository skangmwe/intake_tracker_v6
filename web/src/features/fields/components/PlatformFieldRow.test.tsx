import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildPlatformField } from '@/test-utils';

import { PlatformFieldRow } from './PlatformFieldRow';

describe('PlatformFieldRow', () => {
  it('PlatformFieldRow — system field — renders read-only, no form', () => {
    render(
      <ul>
        <PlatformFieldRow field={buildPlatformField({ isSystemImmutable: true, displayName: 'Record ID' })} isSaving={false} onSave={jest.fn()} />
      </ul>,
    );
    expect(screen.getByText(/system · read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('PlatformFieldRow — editable field — saves the edited name', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(
      <ul>
        <PlatformFieldRow field={buildPlatformField()} isSaving={false} onSave={onSave} />
      </ul>,
    );

    // Act
    const input = screen.getByDisplayValue('Legacy ID');
    await user.clear(input);
    await user.type(input, 'Legacy Identifier');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith('legacy-id', 'Legacy Identifier', null);
  });

  it('PlatformFieldRow — select field — saves parsed options', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(
      <ul>
        <PlatformFieldRow
          field={buildPlatformField({ fieldKey: 'ai-solutions-status', displayName: 'AI Solutions Status', fieldType: 'Select', selectOptions: ['New'] })}
          isSaving={false}
          onSave={onSave}
        />
      </ul>,
    );

    // Act
    const options = screen.getByDisplayValue('New');
    await user.clear(options);
    await user.type(options, 'New, In build, Live');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith('ai-solutions-status', 'AI Solutions Status', ['New', 'In build', 'Live']);
  });

  it('PlatformFieldRow — no axe violations', async () => {
    const { container } = render(
      <ul>
        <PlatformFieldRow field={buildPlatformField()} isSaving={false} onSave={jest.fn()} />
      </ul>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

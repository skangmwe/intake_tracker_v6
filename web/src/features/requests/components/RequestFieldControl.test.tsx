// Smoke test for the RequestFieldControl re-export shim. The full per-fieldType case list lives in
// shared/components/Form/FieldControl.test.tsx; here we only confirm the shim renders the shared
// control unchanged for Request call-sites.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';

import type { FieldDefinitionDto } from '@shared/types';

import { buildFieldDefinition } from '@/test-utils';

import { RequestFieldControl } from './RequestFieldControl';

describe('RequestFieldControl (shim)', () => {
  it('RequestFieldControl — re-exports the shared FieldControl and renders a control', async () => {
    // Arrange
    const def: FieldDefinitionDto = buildFieldDefinition({
      isRequired: false,
      fieldKey: 'summary',
      displayName: 'Summary',
      fieldType: 'LongText',
    });

    // Act
    const { container } = render(<RequestFieldControl field={def} value="hi" onChange={jest.fn()} required={false} />);

    // Assert
    const control = screen.getByRole('textbox', { name: 'Summary (optional)' });
    expect(control.tagName).toBe('TEXTAREA');
    expect(await axe(container)).toHaveNoViolations();
  });
});

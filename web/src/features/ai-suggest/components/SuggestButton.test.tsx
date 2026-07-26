// Behaviour + a11y tests for the per-field Suggest affordance. Covers the off-switch gate (hidden), idle,
// loading, error, no-suggestion, and the result → accept / dismiss flow. The config hook and the suggestion
// api are mocked at their module boundaries; axe runs on each meaningfully different rendered state.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { WorkspaceId } from '@shared/types';

import { buildFieldDefinition, renderWithProviders } from '@/test-utils';

import { apiFetch } from '@/shared/http/apiClient';
import type { FieldSuggestContext } from '../types';
import { useAiConfig } from '@/features/ai-config';

import { SuggestButton } from './SuggestButton';

// Mock at the HTTP boundary so the feature's real api.ts + useFieldSuggestion hook are exercised.
jest.mock('@/shared/http/apiClient');
jest.mock('@/features/ai-config');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedUseAiConfig = useAiConfig as jest.MockedFunction<typeof useAiConfig>;

const CONTEXT: FieldSuggestContext = {
  workspaceId: 'ws-1' as WorkspaceId,
  objectType: 'Request',
  recordId: 'AIS-00000001',
  siblingValues: { description: 'Onboard Acme litigation team' },
};

const FIELD = buildFieldDefinition({
  fieldKey: 'name',
  displayName: 'Solution name',
  fieldType: 'ShortText',
});

function configEnabled(enabled: boolean) {
  mockedUseAiConfig.mockReturnValue({
    data: enabled
      ? { enabled: true, contentFieldAllowlist: ['Name', 'Description', 'WorkflowDetails'] }
      : undefined,
  } as ReturnType<typeof useAiConfig>);
}

function renderButton(onAccept = jest.fn()) {
  const view = renderWithProviders(
    <SuggestButton field={FIELD} context={CONTEXT} onAccept={onAccept} />,
  );
  return { onAccept, ...view };
}

describe('SuggestButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SuggestButton — AI assist off — renders nothing and no violations', async () => {
    // Arrange
    configEnabled(false);

    // Act
    const { container } = renderButton();

    // Assert
    expect(screen.queryByRole('button', { name: /suggest a value/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SuggestButton — enabled idle — shows the trigger and no violations', async () => {
    // Arrange
    configEnabled(true);

    // Act
    const { container } = renderButton();

    // Assert
    expect(
      screen.getByRole('button', { name: /suggest a value for solution name/i }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SuggestButton — while suggesting — shows a status and no violations', async () => {
    // Arrange - a request that never resolves keeps the loading state.
    configEnabled(true);
    mockedFetch.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { container } = renderButton();

    // Act
    await user.click(screen.getByRole('button', { name: /suggest a value/i }));

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent(/suggesting/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SuggestButton — request fails — shows an error and no violations', async () => {
    // Arrange
    configEnabled(true);
    mockedFetch.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    const { container } = renderButton();

    // Act
    await user.click(screen.getByRole('button', { name: /suggest a value/i }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t suggest a value/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SuggestButton — no confident suggestion — shows the empty message', async () => {
    // Arrange
    configEnabled(true);
    mockedFetch.mockResolvedValueOnce({ value: null, rationale: 'Not enough context.' });
    const user = userEvent.setup();
    renderButton();

    // Act
    await user.click(screen.getByRole('button', { name: /suggest a value/i }));

    // Assert
    expect(await screen.findByText(/no confident suggestion/i)).toBeInTheDocument();
  });

  it('SuggestButton — a suggestion — Accept fills the field and Dismiss clears it', async () => {
    // Arrange
    configEnabled(true);
    mockedFetch.mockResolvedValue({ value: 'Acme onboarding', rationale: 'From the description.' });
    const user = userEvent.setup();
    const { onAccept, container } = renderButton();

    // Act - request a suggestion.
    await user.click(screen.getByRole('button', { name: /suggest a value/i }));
    expect(await screen.findByText('Acme onboarding')).toBeInTheDocument();
    expect(screen.getByText(/from the description/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Assert - the POST hit the field-suggestion route with only allowlisted context (target key excluded).
    expect(mockedFetch).toHaveBeenCalledWith(
      '/v1/workspaces/ws-1/ai/field-suggestion',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          targetFieldKey: 'name',
          objectType: 'Request',
          fields: { description: 'Onboard Acme litigation team' },
        }),
      }),
    );

    // Act - accept the suggestion.
    await user.click(screen.getByRole('button', { name: /accept/i }));

    // Assert - the value is applied and the panel is dismissed.
    expect(onAccept).toHaveBeenCalledWith('Acme onboarding');
    await waitFor(() => expect(screen.queryByText('Acme onboarding')).not.toBeInTheDocument());
  });

  it('SuggestButton — single-select — sends option values, shows the label, Accept applies the value', async () => {
    // Arrange - a single-select field; the model returns an option value.
    configEnabled(true);
    mockedFetch.mockResolvedValue({ value: 'high', rationale: 'Time-sensitive request.' });
    const selectField = buildFieldDefinition({
      fieldKey: 'priority',
      displayName: 'Priority',
      fieldType: 'SingleSelect',
      options: [{ id: 'o1', value: 'high', label: 'High', sortOrder: 0 }],
    });
    const onAccept = jest.fn();
    renderWithProviders(
      <SuggestButton field={selectField} context={CONTEXT} onAccept={onAccept} />,
    );
    const user = userEvent.setup();

    // Act
    await user.click(screen.getByRole('button', { name: /suggest a value for priority/i }));

    // Assert - the option label is shown (not the raw value); the option values are sent as the choice set.
    expect(await screen.findByText('High')).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith(
      '/v1/workspaces/ws-1/ai/field-suggestion',
      expect.objectContaining({ body: expect.objectContaining({ selectOptions: ['high'] }) }),
    );

    // Act - accepting applies the underlying value, not the label.
    await user.click(screen.getByRole('button', { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledWith('high');
  });

  it('SuggestButton — Dismiss clears the panel without applying', async () => {
    // Arrange
    configEnabled(true);
    mockedFetch.mockResolvedValue({ value: 'Acme onboarding', rationale: 'From the description.' });
    const user = userEvent.setup();
    const { onAccept } = renderButton();

    // Act
    await user.click(screen.getByRole('button', { name: /suggest a value/i }));
    await screen.findByText('Acme onboarding');
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    // Assert
    expect(onAccept).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Acme onboarding')).not.toBeInTheDocument());
  });
});

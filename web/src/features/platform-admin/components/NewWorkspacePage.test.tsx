// NewWorkspacePage (S38 redesign) — the full-screen New workspace wizard. Covers the Template step
// (recommended card), the Review step (template objects), a successful create (uppercased prefix +
// admin email), and the API-error surface on the Details step. jest-axe runs on each meaningfully
// different state (web-testing.md).

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeDto, WorkspaceId, WorkspaceProvisionResult } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { provisionWorkspace } from '../api';
import { NewWorkspacePage } from './NewWorkspacePage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedProvision = provisionWorkspace as jest.MockedFunction<typeof provisionWorkspace>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const provisioned: WorkspaceProvisionResult = {
  id: '00000000-0000-4000-8000-0000000000cc' as WorkspaceId,
  name: 'Employment',
  kind: 'pg-dept',
  prefix: 'EMP',
};

function renderWizard(me: MeDto = buildMe({ isPlatformAdmin: true })) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<NewWorkspacePage />, { seedMe: me });
}

async function advanceToDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /continue/i })); // Template → Review
  await user.click(await screen.findByRole('button', { name: /continue/i })); // Review → Details
}

beforeEach(() => jest.clearAllMocks());

it('NewWorkspacePage — template step — shows the recommended template card', async () => {
  // Arrange + Act
  const { container } = renderWizard();

  // Assert
  expect(await screen.findByText(/PG\/Dept Template/i)).toBeInTheDocument();
  expect(screen.getByText(/recommended/i)).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('NewWorkspacePage — review step — lists the template objects', async () => {
  // Arrange
  const user = userEvent.setup();

  // Act
  const { container } = renderWizard();
  await user.click(await screen.findByRole('button', { name: /continue/i }));

  // Assert
  expect(await screen.findByText('Requests')).toBeInTheDocument();
  expect(screen.getByText('Attachments')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('NewWorkspacePage — details step — shows the three fields', async () => {
  // Arrange
  const user = userEvent.setup();

  // Act
  const { container } = renderWizard();
  await advanceToDetails(user);

  // Assert
  expect(await screen.findByLabelText(/workspace name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/workspace owner/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/record id prefix/i)).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('NewWorkspacePage — create — provisions and navigates to the list', async () => {
  // Arrange
  mockedProvision.mockResolvedValue(provisioned);
  const user = userEvent.setup();

  // Act
  renderWizard();
  await advanceToDetails(user);
  await user.type(screen.getByLabelText(/workspace name/i), 'Employment');
  await user.type(screen.getByLabelText(/workspace owner/i), 'admin@mws.ai');
  await user.type(screen.getByLabelText(/record id prefix/i), 'emp');
  await user.click(screen.getByRole('button', { name: /create workspace/i }));

  // Assert
  await waitFor(() =>
    expect(mockedProvision).toHaveBeenCalledWith({
      name: 'Employment',
      prefix: 'EMP',
      initialAdminEmail: 'admin@mws.ai',
    }),
  );
});

it('NewWorkspacePage — API error — surfaces inline on the details step', async () => {
  // Arrange
  mockedProvision.mockRejectedValue(new Error('Prefix already in use.'));
  const user = userEvent.setup();

  // Act
  const { container } = renderWizard();
  await advanceToDetails(user);
  await user.type(screen.getByLabelText(/workspace name/i), 'Employment');
  await user.type(screen.getByLabelText(/workspace owner/i), 'admin@mws.ai');
  await user.type(screen.getByLabelText(/record id prefix/i), 'emp');
  await user.click(screen.getByRole('button', { name: /create workspace/i }));

  // Assert
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

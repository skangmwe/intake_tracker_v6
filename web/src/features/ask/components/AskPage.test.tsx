// Behaviour + a11y tests for the Ask page. The config api + the session hook are mocked so each state is
// exercised: AI off (explicit off message), AI on + empty (intro + composer), and AI on with an answered
// turn. axe runs on the off and empty states.

import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as aiConfigApi from '@/features/ai-config/api';
import * as askModel from '../askModel';
import type { AskTurn } from '../types';
import { AskPage } from './AskPage';

jest.mock('@/features/ai-config/api');
jest.mock('../askModel');

const mockedConfigApi = aiConfigApi as jest.Mocked<typeof aiConfigApi>;
const mockedModel = askModel as jest.Mocked<typeof askModel>;

const memberMe = buildMe({ memberships: [buildMembership()] });

function seedHook(turns: AskTurn[] = []) {
  mockedModel.useAskConversation.mockReturnValue({
    turns,
    isStreaming: false,
    ask: jest.fn(),
    stop: jest.fn(),
    rate: jest.fn(),
  });
}

describe('AskPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedHook();
  });

  it('AskPage — AI disabled — shows the off message, no violations', async () => {
    // Arrange
    mockedConfigApi.fetchAiConfig.mockResolvedValue({ enabled: false, contentFieldAllowlist: ['Name'] });

    // Act
    const { container } = renderWithProviders(<AskPage />, { seedMe: memberMe });

    // Assert
    expect(await screen.findByText(/ai assist is off for this workspace/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AskPage — AI enabled, empty — shows the intro and composer, no violations', async () => {
    // Arrange
    mockedConfigApi.fetchAiConfig.mockResolvedValue({ enabled: true, contentFieldAllowlist: ['Name'] });

    // Act
    const { container } = renderWithProviders(<AskPage />, { seedMe: memberMe });

    // Assert
    expect(await screen.findByRole('textbox', { name: /ask a question/i })).toBeInTheDocument();
    expect(screen.getByText(/i’ll answer from the requests you can see/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AskPage — no workspace — prompts to open one', async () => {
    // Arrange - a user with no memberships resolves no active workspace.
    mockedConfigApi.fetchAiConfig.mockResolvedValue({ enabled: true, contentFieldAllowlist: ['Name'] });

    // Act
    renderWithProviders(<AskPage />, { seedMe: buildMe({ memberships: [] }) });

    // Assert
    expect(await screen.findByText(/open a workspace to use ask/i)).toBeInTheDocument();
  });

  it('AskPage — config load fails — shows an error', async () => {
    // Arrange
    mockedConfigApi.fetchAiConfig.mockRejectedValueOnce(new Error('boom'));

    // Act
    renderWithProviders(<AskPage />, { seedMe: memberMe });

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load ask/i);
  });

  it('AskPage — AI enabled with an answered turn — renders the cited answer', async () => {
    // Arrange
    mockedConfigApi.fetchAiConfig.mockResolvedValue({ enabled: true, contentFieldAllowlist: ['Name'] });
    seedHook([
      { id: 'u1', role: 'user', text: 'retention?', citations: [], isStreaming: false },
      {
        id: 'a1',
        role: 'assistant',
        text: 'Handled here [cite:1].',
        citations: [{ marker: 1, recordId: 'LIT-9004', title: 'Retention helper' }],
        isStreaming: false,
        messageId: 'm1',
      },
    ]);

    // Act
    renderWithProviders(<AskPage />, { seedMe: memberMe });

    // Assert
    expect(await screen.findByRole('link', { name: /source 1: retention helper/i })).toBeInTheDocument();
  });
});

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { DraftDto } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { AddToCatalogPage } from './AddToCatalogPage';
import { deleteFeatureDraft, fetchFeatureDraft } from '../api';
import { useCreateFeature } from '../useFeatures';

jest.mock('../useFeatures');
jest.mock('../api');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

const mockedUseCreate = useCreateFeature as jest.MockedFunction<typeof useCreateFeature>;
const mockedFetchDraft = fetchFeatureDraft as jest.MockedFunction<typeof fetchFeatureDraft>;
const mockedDeleteDraft = deleteFeatureDraft as jest.MockedFunction<typeof deleteFeatureDraft>;
const createMutate = jest.fn();

describe('AddToCatalogPage', () => {
  beforeEach(() => {
    mockedUseCreate.mockReturnValue({
      mutate: createMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCreateFeature>);
  });
  afterEach(() => jest.clearAllMocks());

  it('AddToCatalogPage — renders the blank "New feature" form with no a11y violations', async () => {
    // Act
    const { container } = renderWithProviders(<AddToCatalogPage />, {
      route: '/feature-catalog/new',
    });

    // Assert
    expect(screen.getByRole('heading', { name: 'New feature' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AddToCatalogPage — Save requires a name and a type, then creates the feature', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<AddToCatalogPage />, { route: '/feature-catalog/new' });
    const save = screen.getByRole('button', { name: 'Save to catalog' });

    // Assert — disabled until required fields are set
    expect(save).toBeDisabled();

    // Act
    await user.type(screen.getByLabelText('Name'), 'Citation overlay');
    await user.selectOptions(screen.getByLabelText('Feature type'), 'UI/visual');
    await user.click(save);

    // Assert
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      name: 'Citation overlay',
      featureType: 'UI/visual',
    });
  });

  it('AddToCatalogPage — prefills from a source draft and shows the add-to-catalog heading', async () => {
    // Arrange — a draft carrying an array field, a string field, and a repo url
    const draft = {
      title: 'Deposition summarizer',
      body: {
        fields: { techStack: ['React', 'TypeScript'], solutionPattern: 'Extract', repoUrl: 'github.com/mws/dep' },
        queuedLinks: [{ linkType: 'sourced-from', targetRecordId: 'AIS-00000001' }],
      },
    } as unknown as DraftDto;
    mockedFetchDraft.mockResolvedValue(draft);

    // Act
    renderWithProviders(<AddToCatalogPage />, { route: '/feature-catalog/new?draft=d1' });

    // Assert — prefilled, with the "add to catalog" heading and lede
    expect(await screen.findByDisplayValue('Deposition summarizer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add to catalog' })).toBeInTheDocument();
    expect(screen.getByText(/Prefilled from the source request/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tech \/ stack/)).toHaveValue('React, TypeScript'); // array → csv
    expect(screen.getByLabelText(/Solution pattern/)).toHaveValue('Extract'); // string → verbatim
    expect(screen.getByLabelText(/Repo \/ component URL/)).toHaveValue('github.com/mws/dep');
  });

  it('AddToCatalogPage — a draft with no body fields prefills to empty strings', async () => {
    // Arrange — no title, no fields, no queued links (exercises the ?? fallbacks)
    const draft = { body: {} } as unknown as DraftDto;
    mockedFetchDraft.mockResolvedValue(draft);

    // Act
    renderWithProviders(<AddToCatalogPage />, { route: '/feature-catalog/new?draft=d2' });

    // Assert
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add to catalog' })).toBeInTheDocument());
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText(/Tech \/ stack/)).toHaveValue('');
    expect(screen.getByLabelText(/Repo \/ component URL/)).toHaveValue('');
  });

  it('AddToCatalogPage — submitting a prefilled draft stamps optional fields and discards the draft', async () => {
    // Arrange — a local mutate that resolves via onSuccess so the draft cleanup + navigate run
    const user = userEvent.setup();
    const mutate = jest.fn((_request: unknown, opts: { onSuccess: (feature: { id: string }) => void }) =>
      opts.onSuccess({ id: 'feat-9' }),
    );
    mockedUseCreate.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCreateFeature>);
    const draft = {
      title: 'Seed',
      body: { fields: {}, queuedLinks: [{ linkType: 'sourced-from', targetRecordId: 'AIS-00000001' }] },
    } as unknown as DraftDto;
    mockedFetchDraft.mockResolvedValue(draft);
    mockedDeleteDraft.mockResolvedValue(undefined);
    renderWithProviders(<AddToCatalogPage />, { route: '/feature-catalog/new?draft=d3' });
    await screen.findByRole('heading', { name: 'Add to catalog' });

    // Act — fill the optional fields and the required type, then save
    await user.selectOptions(screen.getByLabelText('Feature type'), 'Functional');
    await user.type(screen.getByLabelText(/Owner/), 'user-1');
    await user.type(screen.getByLabelText(/Demo URL/), 'demo.example');
    await user.type(screen.getByLabelText(/Repo \/ component URL/), 'repo.example');
    await user.click(screen.getByRole('button', { name: 'Save to catalog' }));

    // Assert — optional fields + queued links stamped; the draft is discarded on success
    expect(mutate.mock.calls[0]![0]).toMatchObject({
      owner: 'user-1',
      demoUrl: 'demo.example',
      repoUrl: 'repo.example',
      queuedLinks: [{ linkType: 'sourced-from', targetRecordId: 'AIS-00000001' }],
    });
    expect(mockedDeleteDraft).toHaveBeenCalledWith('d3');
  });

  it('AddToCatalogPage — a failed create shows the error alert', () => {
    // Arrange
    mockedUseCreate.mockReturnValue({
      mutate: createMutate,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useCreateFeature>);

    // Act
    renderWithProviders(<AddToCatalogPage />, { route: '/feature-catalog/new' });

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t be saved/i);
  });

  it('AddToCatalogPage — shows a saving state while the create is pending', () => {
    // Arrange
    mockedUseCreate.mockReturnValue({
      mutate: createMutate,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useCreateFeature>);

    // Act
    renderWithProviders(<AddToCatalogPage />, { route: '/feature-catalog/new' });

    // Assert
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
  });
});

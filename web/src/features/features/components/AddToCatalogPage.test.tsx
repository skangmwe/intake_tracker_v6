import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils';

import { AddToCatalogPage } from './AddToCatalogPage';
import { useCreateFeature } from '../useFeatures';

jest.mock('../useFeatures');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

const mockedUseCreate = useCreateFeature as jest.MockedFunction<typeof useCreateFeature>;
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
});

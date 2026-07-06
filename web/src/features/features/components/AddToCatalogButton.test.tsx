import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { RecordId } from '@shared/types';

import { renderWithProviders, buildMe, buildMembership } from '@/test-utils';
import { useMe } from '@/features/users/useMe';

import { AddToCatalogButton } from './AddToCatalogButton';
import { useAddToCatalog } from '../useFeatures';

jest.mock('@/features/users/useMe');
jest.mock('../useFeatures');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseAdd = useAddToCatalog as jest.MockedFunction<typeof useAddToCatalog>;
const addMutate = jest.fn();

function mockAdd() {
  mockedUseAdd.mockReturnValue({
    mutate: addMutate,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useAddToCatalog>);
}

describe('AddToCatalogButton', () => {
  afterEach(() => jest.clearAllMocks());

  it('AddToCatalogButton — renders for an AI Solutions member and harvests on click', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedUseMe.mockReturnValue({
      data: buildMe({ memberships: [buildMembership({ workspaceKind: 'ai-solutions' })] }),
    } as ReturnType<typeof useMe>);
    mockAdd();

    // Act
    const { container } = renderWithProviders(
      <AddToCatalogButton sourceRecordId={'AIS-00000001' as RecordId} />,
    );
    await user.click(screen.getByRole('button', { name: /Add to catalog/ }));

    // Assert
    expect(addMutate).toHaveBeenCalledWith('AIS-00000001', expect.anything());
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AddToCatalogButton — renders nothing for a non-AI-Solutions member', () => {
    // Arrange
    mockedUseMe.mockReturnValue({
      data: buildMe({ memberships: [buildMembership({ workspaceKind: 'pg-dept' })] }),
    } as ReturnType<typeof useMe>);
    mockAdd();

    // Act
    const { container } = renderWithProviders(
      <AddToCatalogButton sourceRecordId={'BIZ-00000001' as RecordId} />,
    );

    // Assert
    expect(container).toBeEmptyDOMElement();
  });
});

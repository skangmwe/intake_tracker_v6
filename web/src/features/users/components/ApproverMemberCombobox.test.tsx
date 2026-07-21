// ApproverMemberCombobox — the add-a-person typeahead. Covers filtering as you type, picking an
// option (resolves by email) via click and via keyboard (ArrowDown + Enter), free-text submit
// (Enter / Add member button when nothing is highlighted), field-clear on success, and Escape to
// close. jest-axe runs against the closed input and the open listbox (web-testing.md).

import { axe } from 'jest-axe';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApproverMemberCombobox, type MemberOption } from './ApproverMemberCombobox';

const MEMBERS: MemberOption[] = [
  { userId: 'u1', displayName: 'Ada Byron', email: 'ada@example.com' },
  { userId: 'u2', displayName: 'Bo Chen', email: 'bo@example.com' },
];

function renderCombobox(onAdd = jest.fn().mockResolvedValue(true), members = MEMBERS) {
  return render(<ApproverMemberCombobox roleLabel="InfoSec" members={members} onAdd={onAdd} />);
}

describe('ApproverMemberCombobox', () => {
  it('ApproverMemberCombobox — renders the input and add button; closed state is accessible', async () => {
    // Act
    const { container } = renderCombobox();

    // Assert
    expect(screen.getByRole('combobox', { name: 'Add member to InfoSec' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add member/i })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverMemberCombobox — typing filters the options; open listbox is accessible', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderCombobox();

    // Act
    await user.type(screen.getByRole('combobox'), 'ada');

    // Assert
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByRole('option', { name: /ada byron/i })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: /bo chen/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverMemberCombobox — clicking an option fills the field but does not add; Add member adds by email', async () => {
    // Arrange
    const onAdd = jest.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderCombobox(onAdd);
    const input = screen.getByRole('combobox');

    // Act — focus opens the list; click the option.
    await user.click(input);
    await user.click(screen.getByRole('option', { name: /ada byron/i }));

    // Assert — the field is filled with the name and nothing has been added yet.
    expect(input).toHaveValue('Ada Byron');
    expect(onAdd).not.toHaveBeenCalled();

    // Act — confirm with Add member.
    await user.click(screen.getByRole('button', { name: /add member/i }));

    // Assert — resolved by the unique email, then the field clears.
    expect(onAdd).toHaveBeenCalledWith('ada@example.com');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('ApproverMemberCombobox — ArrowDown + Enter fills the option; a second Enter adds it', async () => {
    // Arrange
    const onAdd = jest.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderCombobox(onAdd);
    const input = screen.getByRole('combobox');

    // Act — highlight + Enter fills the field (no add yet).
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');
    // Assert
    expect(input).toHaveValue('Ada Byron');
    expect(onAdd).not.toHaveBeenCalled();

    // Act — a second Enter (list closed) submits.
    await user.keyboard('{Enter}');
    // Assert — added by the unique email.
    expect(onAdd).toHaveBeenCalledWith('ada@example.com');
  });

  it('ApproverMemberCombobox — editing after choosing clears the pick and submits free text', async () => {
    // Arrange
    const onAdd = jest.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderCombobox(onAdd);
    const input = screen.getByRole('combobox');

    // Act — choose Ada, then edit the text, then Add member.
    await user.click(input);
    await user.click(screen.getByRole('option', { name: /ada byron/i }));
    await user.type(input, ' (contractor)');
    await user.click(screen.getByRole('button', { name: /add member/i }));

    // Assert — the edited free text is submitted, not the picked email.
    expect(onAdd).toHaveBeenCalledWith('Ada Byron (contractor)');
  });

  it('ApproverMemberCombobox — Enter with nothing highlighted submits the typed text', async () => {
    // Arrange
    const onAdd = jest.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderCombobox(onAdd);

    // Act — type an exact email that isn't matched-then-highlighted, press Enter.
    await user.type(screen.getByRole('combobox'), 'someone@example.com{Enter}');

    // Assert — the free-text value is submitted as-is.
    expect(onAdd).toHaveBeenCalledWith('someone@example.com');
  });

  it('ApproverMemberCombobox — Add member button submits the typed text', async () => {
    // Arrange
    const onAdd = jest.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderCombobox(onAdd);

    // Act
    await user.type(screen.getByRole('combobox'), 'Dana Cole');
    await user.click(screen.getByRole('button', { name: /add member/i }));

    // Assert
    expect(onAdd).toHaveBeenCalledWith('Dana Cole');
  });

  it('ApproverMemberCombobox — Escape closes the listbox', async () => {
    // Arrange
    const user = userEvent.setup();
    renderCombobox();
    const input = screen.getByRole('combobox');

    // Act
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    // Assert
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

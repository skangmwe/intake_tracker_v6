// Add-a-person combobox for an approver team (S29). Enhances the prototype's plain input with a
// WAI-ARIA combobox that filters to the workspace's active members as the admin types. Choosing a
// member (click or Enter on the highlighted option) fills the field and remembers the pick; nothing
// is added until "Add member" (or Enter with the list closed). Picking resolves by the member's
// unique email; free text is resolved server-side. Keyboard: ArrowUp/Down move, Enter chooses the
// highlighted option or (when none) submits, Escape closes.

import { useId, useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';

import { Button } from '@/shared/components/Button';
import { useDismissable } from '@/shared/hooks/useDismissable';

/** A pickable active member. */
export interface MemberOption {
  userId: string;
  displayName: string;
  email: string;
}

const MAX_MEMBER_SUGGESTIONS = 8;

interface ApproverMemberComboboxProps {
  roleLabel: string;
  /** Active workspace members not already on this team. */
  members: MemberOption[];
  /** Resolve + add the person (name or email). Returns true when added (clears the field). */
  onAdd: (person: string) => Promise<boolean>;
}

export function ApproverMemberCombobox({ roleLabel, members, onAdd }: ApproverMemberComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // The member chosen from the list, if any — submit resolves by its unique email. Cleared when the
  // admin edits the text, so a hand-typed value always submits as free text.
  const [picked, setPicked] = useState<MemberOption | null>(null);
  const listId = useId();

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };
  const ref = useDismissable<HTMLSpanElement>(open, close);

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches =
      needle === ''
        ? members
        : members.filter(
            (member) =>
              member.displayName.toLowerCase().includes(needle) || member.email.toLowerCase().includes(needle),
          );
    return matches.slice(0, MAX_MEMBER_SUGGESTIONS);
  }, [query, members]);

  // Choose an option: fill the field + remember the pick. Does NOT add — the admin confirms with
  // "Add member" (or Enter with the list closed).
  const choose = (member: MemberOption) => {
    setPicked(member);
    setQuery(member.displayName);
    close();
  };

  // Add the chosen member (by email) or the typed free text.
  const submit = async () => {
    const person = picked ? picked.email : query;
    if (person.trim() === '') return;
    const added = await onAdd(person);
    if (added) {
      setQuery('');
      setPicked(null);
      close();
    }
  };

  const showList = open && suggestions.length > 0;
  const activeOptionId = showList && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = showList && activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      if (option) {
        choose(option);
      } else {
        void submit();
      }
    } else if (event.key === 'Escape') {
      close();
    }
  };

  return (
    <span className="approver-combobox" ref={ref}>
      <span className="approver-team__add">
        <input
          className="mws-input mws-input--compact approver-team__add-input"
          data-ds="input"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-label={`Add member to ${roleLabel}`}
          placeholder="Add a person…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPicked(null);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <Button variant="secondary" compact onClick={() => void submit()}>
          <Plus size={16} aria-hidden /> Add member
        </Button>
      </span>
      {showList && (
        <ul className="approver-combobox__list" role="listbox" id={listId} aria-label={`${roleLabel} — matching members`}>
          {suggestions.map((member, index) => (
            <li
              key={member.userId}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`approver-combobox__option${index === activeIndex ? ' is-active' : ''}`}
              // Mouse-down (not click) so choosing fires before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(member);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="approver-combobox__option-name">{member.displayName}</span>
              <span className="approver-combobox__option-email">{member.email}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

# fix-add-member-modal-7decb1e — tests added / extended

## Iteration 1
- AddMemberForm.test.tsx: added "submits on Enter from the email field (implicit form submission)"
  to cover the new `onFormSubmit` path introduced when the footer button moved to `type="button"`.
- AddMemberForm.test.tsx: updated the level-select label matcher to /access level/i.
- MembersPanel.test.tsx: updated the ADD MEMBER toggle test to assert the modal dialog opens/closes
  (aria-haspopup="dialog") instead of the removed inline `aria-expanded` panel.

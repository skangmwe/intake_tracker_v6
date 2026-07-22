# fix-member-menu-descriptions-786fbcd — tests added / extended

## Iteration 1
- RowActionsMenu.test.tsx: added description-text assertions for Active / Suspended / Invited menus;
  an accessible-description assertion (aria-describedby wiring); and axe coverage for the Suspended
  and Invited open menus (destructive rows). Existing name-based menuitem queries still pass because
  each item's accessible name stays the bare action label via aria-label.

// Aging-tint helper — maps a record's SLA status to a row-background tint class. Colour is never
// the sole signal (accessibility.md): the requests list pairs the tint with a text suffix.
// Consumers import the CSS via `import './AgingTint.css'` where the tint classes are applied.

import type { SlaStatus } from '@shared/types';

/** Returns the row-tint class for an SLA status, or '' when on-track / unknown (no tint). */
export function agingTintClass(slaStatus?: SlaStatus): string {
  switch (slaStatus) {
    case 'DueSoon':
      return 'mws-aging-tint--due-soon';
    case 'Overdue':
      return 'mws-aging-tint--overdue';
    default:
      return '';
  }
}

// S41 Empty list — zero-data (first-run) empty state. Pale-fill surface with the new-user ceremony:
// icon, title, one-line context, primary CTA. Navy text throughout (theme-stable rule — pale fill
// never uses the themed --text-primary). Distinct from filtered-to-zero (S42), which is a bordered
// card, never a pale fill. Renders below a page's own <h1>, so its title is an <h2>.

import { useId, type ComponentType, type ReactNode } from 'react';
import { Tray, type IconProps } from '@phosphor-icons/react';

interface EmptyListZeroDataProps {
  /** Zero-data title, e.g. "No requests yet". */
  title: string;
  /** One sentence explaining the value of creating the first item. */
  message: string;
  /** Primary CTA (typically a <Button variant="primary">). Optional — some lists are read-only. */
  action?: ReactNode;
  /** Phosphor icon for the ceremony. Defaults to an empty tray. */
  icon?: ComponentType<IconProps>;
}

export function EmptyListZeroData({
  title,
  message,
  action,
  icon: Icon = Tray,
}: EmptyListZeroDataProps) {
  const titleId = useId();
  return (
    <section className="mws-empty mws-empty--zero" data-ds="empty-zero" aria-labelledby={titleId}>
      <Icon className="mws-empty__icon" size={48} weight="regular" aria-hidden="true" />
      <h2 id={titleId} className="mws-empty__title">
        {title}
      </h2>
      <p className="mws-empty__body">{message}</p>
      {action && <div className="mws-empty__actions">{action}</div>}
    </section>
  );
}

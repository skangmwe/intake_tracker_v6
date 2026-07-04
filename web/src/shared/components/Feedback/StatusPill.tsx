// Status pill — pale-fill badge with navy text always (theme-stable foreground rule).
// Colour is paired with the label text, never used as the sole signal
// (notifications-and-feedback.md). Reuses the global .mws-badge system.

type StatusKind = 'info' | 'success' | 'warning' | 'error' | 'neutral';

interface StatusPillProps {
  status: StatusKind;
  label: string;
}

const STATUS_CLASS: Record<StatusKind, string> = {
  info: 'mws-badge mws-badge--info',
  success: 'mws-badge mws-badge--live',
  warning: 'mws-badge mws-badge--pending',
  error: 'mws-badge mws-badge--failed',
  neutral: 'mws-badge mws-badge--draft',
};

export function StatusPill({ status, label }: StatusPillProps) {
  return (
    <span className={STATUS_CLASS[status]} data-ds="status-pill">
      {label}
    </span>
  );
}

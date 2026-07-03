// Full-screen bootstrap / sign-in status. Used while MSAL initialises and redirects.

import { CircleNotch } from '@phosphor-icons/react';

interface LoadingScreenProps {
  label: string;
}

export function LoadingScreen({ label }: LoadingScreenProps) {
  return (
    <div className="ast-loading" role="status" aria-live="polite">
      <CircleNotch className="ast-spin" size={32} weight="regular" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

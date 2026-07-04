// Text button (design-system .mws-btn). Variants map to the McDermott button styles; labels never
// wrap (_core-requirements.md). data-ds="btn" is the stable handle the design-fidelity gate pairs
// against the prototype (web-styling.md).

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  compact?: boolean;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'mws-btn mws-btn--primary',
  secondary: 'mws-btn mws-btn--secondary',
  destructive: 'mws-btn mws-btn--destructive',
};

export function Button({ variant = 'primary', compact = false, type = 'button', children, ...rest }: ButtonProps) {
  const className = `${VARIANT_CLASS[variant]}${compact ? ' mws-btn--sm' : ''}`;
  return (
    <button type={type} className={className} data-ds="btn" {...rest}>
      {children}
    </button>
  );
}

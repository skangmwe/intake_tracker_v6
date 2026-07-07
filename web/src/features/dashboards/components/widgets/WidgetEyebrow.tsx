// The uppercase eyebrow label at the top of a KPI / chart tile (prototype pattern). An optional
// leading icon is decorative (aria-hidden) — the text carries the meaning (iconography.md).

import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';

interface WidgetEyebrowProps {
  title: string;
  icon?: ComponentType<IconProps> | undefined;
}

export function WidgetEyebrow({ title, icon: Icon }: WidgetEyebrowProps) {
  return (
    <span className="dash-tile__eyebrow">
      {Icon && <Icon size={16} weight="regular" aria-hidden />}
      {title}
    </span>
  );
}

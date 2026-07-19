// S43 Toolkit gallery view — cards laid out in an auto-fill grid. Each card is a button that opens
// the item's detail sheet; it shows the type pill + status badge, name, a clamped description, and
// the maintainer. Enumerable card data comes from the list rows (scannable columns only).

import type { ToolkitItemListRow } from '@shared/types';

import { kindIcon, kindPillClass, statusBadgeClass } from '../toolkitFormat';

const EM_DASH = '—';

interface ToolkitGalleryProps {
  items: ToolkitItemListRow[];
  onOpen: (id: ToolkitItemListRow['id']) => void;
}

export function ToolkitGallery({ items, onOpen }: ToolkitGalleryProps) {
  return (
    <ul className="tk-gallery">
      {items.map((item) => {
        const Icon = kindIcon(item.kind);
        return (
          <li key={item.id} className="tk-gallery__item">
            <button type="button" className="tk-card" data-ds="card" onClick={() => onOpen(item.id)}>
              <span className="tk-card__head">
                <span className={`tk-pill ${kindPillClass(item.kind)}`}>
                  <Icon size={14} weight="regular" aria-hidden /> {item.kind}
                </span>
                <span className={`tk-badge ${statusBadgeClass(item.status)}`} data-ds="badge">
                  {item.status}
                </span>
              </span>
              <span className="tk-card__name">{item.name}</span>
              <span className="tk-card__desc line-clamp-3">{item.oneLiner ?? EM_DASH}</span>
              <span className="tk-card__foot">{item.maintainer || EM_DASH}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

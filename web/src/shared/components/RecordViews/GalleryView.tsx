// Gallery view (Slice 24 — S11 Feature gallery, BS §18). Card grid where the visual is the point: first
// image attachment as a thumbnail (placeholder when absent), name, one-liner, a few tag chips. Presentation
// resolves to viewer entitlements — the rows are already access-filtered. Opens the record on card activate.

import { AuthImage } from './AuthImage';
import { Badges, Tags } from './cardParts';
import type { RecordViewItem } from './types';
import './recordViews.css';

export interface GalleryViewProps {
  items: RecordViewItem[];
  /** Accessible caption naming what the gallery shows. */
  caption: string;
}

export function GalleryView({ items, caption }: GalleryViewProps) {
  return (
    <ul className="rv-gallery" aria-label={caption}>
      {items.map((item) => (
        <li key={item.id} className="rv-gallery__cell">
          <article className="rv-card rv-card--gallery">
            <div className="rv-card__thumb">
              <AuthImage path={item.thumbnailUrl} alt={item.title} />
            </div>
            <div className="rv-card__body">
              <button type="button" className="rv-card__open" onClick={item.onOpen}>
                {item.title}
              </button>
              {item.subtitle && <p className="rv-card__subtitle">{item.subtitle}</p>}
              <Badges badges={item.badges} />
              <Tags tags={item.tags} />
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

// Object-type tabs for the Fields & objects admin surface (S30). Tabs switch which object's schema
// is shown (navigation-and-ia.md — tabs for sibling content, keyboard-navigable, scroll not wrap).

import type { FieldObjectType } from '@shared/types';

import { OBJECT_TYPES } from '../constants';

interface ObjectTypeTabsProps {
  active: FieldObjectType;
  onChange: (objectType: FieldObjectType) => void;
}

export function ObjectTypeTabs({ active, onChange }: ObjectTypeTabsProps) {
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    const last = OBJECT_TYPES.length - 1;
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key === 'ArrowRight' ? Math.min(index + 1, last) : Math.max(index - 1, 0);
    const target = OBJECT_TYPES[next];
    if (target) {
      onChange(target);
    }
  };

  return (
    <div className="mws-tabs" role="tablist" aria-label="Object type" data-ds="tab">
      {OBJECT_TYPES.map((objectType, index) => (
        <button
          key={objectType}
          type="button"
          role="tab"
          id={`object-tab-${objectType}`}
          aria-selected={active === objectType}
          tabIndex={active === objectType ? 0 : -1}
          className={active === objectType ? 'mws-tab mws-tab--active' : 'mws-tab'}
          onClick={() => onChange(objectType)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {objectType}
        </button>
      ))}
    </div>
  );
}

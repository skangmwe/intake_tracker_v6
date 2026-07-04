// Horizontal tab strip — active tab carries a 2px bottom accent border. Scrolls horizontally
// on narrow viewports, never wraps (navigation-and-ia.md). Keyboard: Left/Right move + activate,
// Home/End jump to first/last (accessibility.md tabs pattern). Roving tabIndex — only the active
// tab is in the tab order. Reuses the global .mws-tabs / .mws-tab styles.

import { useRef, type KeyboardEvent } from 'react';

interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. */
  label: string;
}

export function Tabs({ tabs, value, onChange, label }: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    const target = tabRefs.current[index];
    const tab = tabs[index];
    if (target && tab) {
      target.focus();
      onChange(tab.id);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = tabs.length - 1;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusTab(index === lastIndex ? 0 : index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTab(index === 0 ? lastIndex : index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTab(lastIndex);
    }
  };

  return (
    <div className="mws-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const isSelected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            className="mws-tab"
            data-ds="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

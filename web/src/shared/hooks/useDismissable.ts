// Closes an open popover/menu on outside pointer-down or Escape. Returns a ref to attach to
// the anchor element (the trigger + floating content should share this wrapper).
//
// `extraRef` is for floating content rendered OUTSIDE the wrapper's DOM subtree (e.g. a popover
// portalled to <body>): a pointer-down inside it must not count as "outside", or the menu would
// dismiss before the click on it registers.

import { type RefObject, useEffect, useRef } from 'react';

export function useDismissable<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  extraRef?: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const insideAnchor = ref.current?.contains(target) ?? false;
      const insideExtra = extraRef?.current?.contains(target) ?? false;
      if (!insideAnchor && !insideExtra) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, extraRef]);

  return ref;
}

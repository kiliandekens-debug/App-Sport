import { useEffect, useRef } from 'react';

// Shared behaviour of bottom sheets: Escape closes, the page behind does not scroll,
// focus moves into the sheet and comes back to where it was when it closes.
export function useModal(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const first = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (first || el).focus({ preventScroll: true });
    }, 30);
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      root.style.overflow = prevOverflow;
      if (before && typeof before.focus === 'function') before.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}

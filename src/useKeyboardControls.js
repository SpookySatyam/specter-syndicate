import { useEffect, useRef } from 'react';

/**
 * Tracks currently-held keys in a mutable Set (no re-renders).
 * Returns a ref whose .current is { held: Set<string>, justPressed: Set<string> }.
 *
 * `held` — keys currently pressed (persists while held).
 * `justPressed` — keys pressed since the last frame. The consumer should call
 *   justPressed.delete(key) after reading to implement single-fire semantics.
 *
 * Usage:
 *   const keys = useKeyboardControls();
 *   // inside useFrame:
 *   if (keys.current.held.has('w')) { ... }             // continuous
 *   if (keys.current.justPressed.has(' ')) { ... }      // single-fire
 */
export default function useKeyboardControls() {
  const keys = useRef({ held: new Set(), justPressed: new Set() });

  useEffect(() => {
    const onDown = (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'j', 'm', 'f', 'q', 'escape', 'tab'].includes(k)) {
        e.preventDefault();
      }
      // Only register justPressed on the initial press, not repeat events
      if (!keys.current.held.has(k)) {
        keys.current.justPressed.add(k);
      }
      keys.current.held.add(k);
    };
    const onUp = (e) => {
      const k = e.key.toLowerCase();
      keys.current.held.delete(k);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  return keys;
}

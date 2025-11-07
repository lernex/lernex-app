import { useEffect, useRef } from "react";

interface UseFocusTrapOptions {
  enabled?: boolean;
  initialFocus?: HTMLElement | null;
}

export function useFocusTrap<T extends HTMLElement>(
  options: UseFocusTrapOptions = {}
) {
  const { enabled = true, initialFocus } = options;
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;

    // Store the currently focused element to restore later
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Get all focusable elements within the container
    const getFocusableElements = (): HTMLElement[] => {
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');

      return Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelectors)
      ).filter((el) => {
        // Filter out hidden elements
        return el.offsetParent !== null;
      });
    };

    // Focus the initial element or the first focusable element
    const focusableElements = getFocusableElements();
    const elementToFocus = initialFocus || focusableElements[0];

    if (elementToFocus) {
      // Small delay to ensure the modal is fully rendered
      setTimeout(() => {
        elementToFocus.focus();
      }, 0);
    }

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement) return;

      // If only one focusable element, prevent tabbing
      if (focusableElements.length === 1) {
        e.preventDefault();
        return;
      }

      // Shift + Tab
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      }
      // Tab
      else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);

    // Cleanup: restore focus to the previously focused element
    return () => {
      container.removeEventListener('keydown', handleTabKey);

      if (previousFocusRef.current && document.body.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
    };
  }, [enabled, initialFocus]);

  return containerRef;
}
